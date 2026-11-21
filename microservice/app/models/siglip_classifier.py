"""SigLIP 2 image embeddings + zero-shot waste classification.

Design (spec §7):
* Embedding generation and classification are **separate** methods.
* Classification = cosine similarity between the image embedding and
  text embeddings of fixed prompt templates — no trained classifier head is
  claimed. This is genuine zero-shot inference from a pretrained SigLIP 2.
* Duplicate detection = cosine similarity against recent image embeddings.
* The model is loaded **once** via the application model registry, never per
  request. CPU and CUDA are both supported.
"""

from __future__ import annotations

from typing import Optional

from PIL import Image

from app.core.logging import get_logger
from app.schemas.response import SiglipSummary
from training.waste_classes import NAMES

logger = get_logger(__name__)

# Fixed textual descriptions of each waste class. Text is encoded with the
# same SigLIP 2 text tower; the highest cosine similarity is the prediction.
_CLASS_PROMPTS: dict[str, str] = {
    "plastic_waste": "a photo of plastic waste, plastic bottles or plastic bags",
    "garbage_bag": "a photo of a tied garbage bag or trash bag full of waste",
    "garbage_dump": "a photo of a garbage dump, pile of trash or waste heap",
    "overflowing_bin": "a photo of an overflowing trash bin or full waste container",
    "construction_waste": "a photo of construction waste, rubble or debris",
    "burning_waste": "a photo of burning waste, trash on fire or smouldering garbage",
    "other_waste": "a photo of litter, scattered rubbish or other environmental waste",
}
_NEGATIVE_PROMPT = "a clean area with no garbage, litter or waste at all"


class SiglipClassifier:
    """SigLIP 2 adapter: embeddings, zero-shot classification, duplicate check."""

    def __init__(
        self,
        model_id: str,
        *,
        device: str = "cpu",
        similarity_threshold: float = 0.85,
    ) -> None:
        self.model_id = model_id
        self.device = device
        self.similarity_threshold = similarity_threshold
        self._model = None
        self._processor = None
        self._text_embeddings = None
        self._load_error: Optional[str] = None
        # Bounded in-memory cache of recent embeddings for duplicate detection.
        self._recent_embeddings: list = []

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def load_error(self) -> Optional[str]:
        return self._load_error

    def load(self) -> bool:
        """Load the pretrained SigLIP 2 checkpoint once. Never raises."""
        if self._model is not None or self._load_error is not None:
            return self.is_loaded
        try:
            from transformers import AutoModel, AutoProcessor
        except Exception as exc:
            self._load_error = f"transformers unavailable: {exc}"
            logger.warning("SigLIP disabled: %s", self._load_error)
            return False
        try:
            import torch

            if self.device == "auto":
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info("Loading SigLIP 2 '%s' on '%s' ...", self.model_id, self.device)
            self._processor = AutoProcessor.from_pretrained(self.model_id)
            self._model = AutoModel.from_pretrained(self.model_id).to(self.device).eval()
            self._prepare_text_embeddings()
            logger.info("SigLIP 2 loaded (device=%s).", self.device)
            return True
        except Exception as exc:
            self._model = None
            self._load_error = str(exc)
            logger.warning("SigLIP model failed to load: %s", exc)
            return False

    @staticmethod
    def _as_tensor(output):
        """Extract a feature tensor from a transformers vision/text output.

        transformers <=4 returns a plain tensor; transformers 5 returns a
        ``BaseModelOutputWithPooling`` with ``pooler_output`` (or hidden state).
        """
        if hasattr(output, "pooler_output") and output.pooler_output is not None:
            return output.pooler_output
        if hasattr(output, "last_hidden_state") and output.last_hidden_state is not None:
            return output.last_hidden_state[:, 0, :]
        return output  # plain tensor on older versions

    def _prepare_text_embeddings(self) -> None:
        """Encode all class prompts + the negative prompt into normalised vectors."""
        import torch

        texts = [_CLASS_PROMPTS.get(name, name) for name in NAMES] + [_NEGATIVE_PROMPT]
        inputs = self._processor(text=texts, return_tensors="pt", padding=True)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            features = self._as_tensor(self._model.get_text_features(**inputs))
        self._text_embeddings = features / features.norm(p=2, dim=-1, keepdim=True)

    # ------------------------------------------------------------------ #
    # Embeddings (separate from classification — spec §7.7)
    # ------------------------------------------------------------------ #
    def embed_image(self, image: Image.Image):
        """Return a normalised image embedding tensor, or None if unavailable."""
        if not self.is_loaded:
            return None
        import torch

        inputs = self._processor(images=image.convert("RGB"), return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            features = self._as_tensor(self._model.get_image_features(**inputs))
        return features / features.norm(p=2, dim=-1, keepdim=True)

    # ------------------------------------------------------------------ #
    # Zero-shot classification
    # ------------------------------------------------------------------ #
    def classify(self, image: Image.Image) -> tuple[Optional[str], Optional[float], Optional[str]]:
        """Return ``(category, confidence, error)`` using cosine similarity.

        Confidence is the softmax over cosine similarities (NOT a trained
        probability) — documented as a relative score only. If the negative
        prompt wins, no waste category is reported.
        """
        if not self.is_loaded:
            return None, None, self._load_error or "siglip_unavailable"
        import torch

        embedding = self.embed_image(image)
        if embedding is None:
            return None, None, "embedding_failed"
        try:
            similarities = (embedding @ self._text_embeddings.T).squeeze(0)
            # SigLIP logit scale: similarities are already well-separated;
            # softmax gives a relative score across the candidate prompts.
            scores = torch.softmax(similarities / 0.07, dim=-1)
            best = int(scores.argmax().item())
            if best == len(NAMES):  # negative prompt won -> no waste
                return "no_waste", float(scores[best].item()), None
            return NAMES[best], float(scores[best].item()), None
        except Exception as exc:
            logger.exception("SigLIP classification failed")
            return None, None, f"siglip_error: {exc}"

    # ------------------------------------------------------------------ #
    # Duplicate detection
    # ------------------------------------------------------------------ #
    def is_duplicate(self, image: Image.Image) -> tuple[bool, Optional[float]]:
        """Compare against recent embeddings (bounded cache, in-process)."""
        embedding = self.embed_image(image)
        if embedding is None:
            return False, None
        best = 0.0
        for previous in self._recent_embeddings:
            best = max(best, float((embedding @ previous.T).item()))
        self._recent_embeddings.append(embedding)
        if len(self._recent_embeddings) > 64:
            self._recent_embeddings.pop(0)
        return best >= self.similarity_threshold, best if best > 0 else None

    def summary(self) -> SiglipSummary:
        """Availability snapshot for the response payload."""
        return SiglipSummary(
            available=self.is_loaded,
            predicted_category=None,
            model_id=self.model_id,  # type: ignore[call-arg]
            error=self._load_error,
        )


__all__ = ["SiglipClassifier"]
