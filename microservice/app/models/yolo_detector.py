"""YOLO object-detection component.

Wraps an Ultralytics YOLO26 checkpoint behind a small, dependency-injectable
interface:

* The model is loaded **once** (via :mod:`app.core.model_loader`) and reused.
* Inference runs on CUDA when available, with automatic CPU fallback.
* Failures (invalid images, inference errors) are contained and surfaced as
  structured results instead of crashing the request.

Note: a pretrained general-purpose checkpoint (e.g. ``yolo26n.pt``) is **not**
a specialised garbage detector — it recognises everyday COCO objects
(bottle, backpack, bird, ...). A waste-specific fine-tune is prepared under
``training/train_yolo.py`` and drops its weights into ``weights/``.
"""

from __future__ import annotations

from typing import Any, Optional

from PIL import Image

from app.core.logging import get_logger
from app.schemas.response import Detection, YoloStatus

logger = get_logger(__name__)


class YoloDetector:
    """Thin adapter around an ``ultralytics.YOLO`` model.

    The constructor does not touch the network or disk; call :meth:`load`
    (normally done once at application startup) before :meth:`predict`.
    """

    def __init__(
        self,
        model_path: str,
        *,
        device: str = "cpu",
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        max_detections: int = 100,
    ) -> None:
        self.model_path = model_path
        self.device = device
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.max_detections = max_detections
        self._model: Any = None
        self._load_error: Optional[str] = None
        self._load_attempted = False

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def load_error(self) -> Optional[str]:
        return self._load_error

    @property
    def model_name(self) -> Optional[str]:
        return getattr(self._model, "ckpt", {}).get("model_name", self.model_path) \
            if self.is_loaded else None

    def load(self) -> bool:
        """Load the checkpoint once. Returns True on success.

        Never raises: a missing ultralytics package, missing weights file, or
        CUDA problem degrades to an *unavailable* detector so the API keeps
        serving other components.
        """
        if self._load_attempted:
            return self.is_loaded
        self._load_attempted = True
        try:
            from ultralytics import YOLO  # imported lazily: heavy dependency
        except Exception as exc:  # pragma: no cover - env dependent
            self._load_error = f"ultralytics unavailable: {exc}"
            logger.warning("YOLO disabled: %s", self._load_error)
            return False

        try:
            logger.info("Loading YOLO model '%s' on device '%s' ...", self.model_path, self.device)
            self._model = YOLO(self.model_path)
            # Resolve an actually-available device (CUDA -> CPU fallback).
            resolved = self.device
            if resolved.startswith("cuda"):
                try:
                    import torch

                    if not torch.cuda.is_available():
                        logger.warning("CUDA requested but unavailable; falling back to CPU.")
                        resolved = "cpu"
                        self.device = "cpu"
                except Exception:
                    resolved = "cpu"
                    self.device = "cpu"
            self._resolve_names()
            logger.info("YOLO model loaded (device=%s).", self.device)
            return True
        except Exception as exc:
            self._model = None
            self._load_error = str(exc)
            logger.warning("YOLO model failed to load: %s", exc)
            return False

    def _resolve_names(self) -> None:
        """Best-effort extraction of the class-name mapping."""
        names = getattr(self._model, "names", None) if self._model else None
        if isinstance(names, dict) and names:
            self.class_names: dict[int, str] = {int(k): str(v) for k, v in names.items()}
        else:
            self.class_names = {}

    # ------------------------------------------------------------------ #
    # Inference
    # ------------------------------------------------------------------ #
    def predict(
        self,
        image: Image.Image,
        *,
        conf: Optional[float] = None,
        iou: Optional[float] = None,
        max_det: Optional[int] = None,
    ) -> tuple[list[Detection], Optional[str]]:
        """Run detection on an RGB image.

        Args:
            image: Decoded RGB image.
            conf: Per-call confidence override.
            iou: Per-call IoU NMS override.
            max_det: Per-call detection cap override.

        Returns:
            ``(detections, error)`` — exactly one is populated; ``error`` is
            ``None`` on success.
        """
        if not self.is_loaded:
            return [], self._load_error or "detector_unavailable"

        try:
            result = self._model.predict(
                source=image,
                conf=conf if conf is not None else self.conf_threshold,
                iou=iou if iou is not None else self.iou_threshold,
                max_det=max_det if max_det is not None else self.max_detections,
                device=self.device,
                verbose=False,
            )
        except Exception as exc:
            logger.exception("YOLO inference failed")
            return [], f"yolo_inference_error: {exc}"

        detections: list[Detection] = []
        try:
            for box in getattr(result[0], "boxes", None) or []:
                cls_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                xyxy = [float(v) for v in box.xyxy[0].tolist()]
                label = self.class_names.get(cls_id, str(cls_id))
                detections.append(
                    Detection(
                        label=label,
                        class_id=cls_id,
                        confidence=confidence,
                        bbox=xyxy,
                    )
                )
        except Exception as exc:
            logger.exception("Failed to parse YOLO output")
            return [], f"yolo_parse_error: {exc}"

        return detections, None

    # ------------------------------------------------------------------ #
    # Introspection
    # ------------------------------------------------------------------ #
    def status(self) -> YoloStatus:
        """Component status for health/readiness endpoints."""
        return YoloStatus(
            available=self.is_loaded,
            model=self.model_path if self.is_loaded else None,
            device=self.device if self.is_loaded else None,
            reason=self._load_error,
        )


__all__ = ["YoloDetector"]
