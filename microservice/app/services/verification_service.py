"""Request-scoped verification orchestration (Phases 1–2).

Phase 2 flow:
1. Validate/decode upload
2. Rekognition moderation + face detection + text detection — **concurrent**,
   bounded by ``verify_concurrency_limit`` (independent API calls)
3. Privacy pass: blur faces & plates, store original/processed separately
4. YOLO + Rekognition labels — **concurrent** on the privacy-processed image
5. Assemble structured response with evidence preserved for inspection

Moderation is reported separately and never decides the waste verdict.
"""

from __future__ import annotations

import asyncio
from typing import Optional

from PIL import Image

from app.core.config import Settings
from app.core.logging import get_logger
from app.schemas.request import ReportType
from app.schemas.response import (
    BedrockSummary,
    Decision,
    Detection,
    DetectResponse,
    ModelVersions,
    PrivacySummary,
    RekLabel,
    RekognitionSummary,
    SiglipSummary,
    VerifyResponse,
    YoloStatus,
)
from app.services.image_processing import prepare_for_inference, preprocess_upload
from app.services.privacy_service import PrivacyService
from app.services.rekognition_service import (
    FaceRegion,
    ModerationResult,
    RekognitionService,
    TextRegion,
)
from app.utils.image_utils import encode_jpeg

logger = get_logger(__name__)

_NO_EVIDENCE_REASON = "No waste evidence detected by available models."
_REVIEW_REASON = "Human verification required"
_DETECTOR_DOWN_REASON = "Detector unavailable; evidence incomplete"
_MODERATION_FLAG_REASON = "Content flagged by moderation; human review required"
_JUDGE_NO_REASON = "Vision judge found no waste evidence."
_JUDGE_UNCERTAIN_REASON = "Vision judge could not confirm the report; human verification required."

# SigLIP's confidence is a *relative* softmax over 7 waste prompts + a negative
# prompt (uniform ≈ 0.125). A weak-but-positive score is still a reason to send
# a report to a human rather than auto-rejecting it — a pretrained zero-shot
# model is not reliable enough to reject on its own.
_SIGLIP_EVIDENCE_MIN_CONFIDENCE = 0.15


class VerificationService:
    """Coordinates validation, privacy, model inference and response assembly."""

    def __init__(self, registry, settings: Optional[Settings] = None):
        # Explicit registry (from app.state) wins so tests can inject fakes.
        self._registry = registry if registry is not None else __import__(
            "app.core.model_loader", fromlist=["get_registry"]
        ).get_registry()
        self._settings = settings or self._registry.settings

    # ------------------------------------------------------------------ #
    # POST /api/v1/verify
    # ------------------------------------------------------------------ #
    async def verify(
        self,
        data: bytes,
        *,
        report_id: str,
        report_type: ReportType,
        declared_mime: Optional[str],
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
    ) -> VerifyResponse:
        """Run the Phase 1–2 verification pipeline.

        Raises ImageValidationError for invalid uploads (routes map to HTTP).
        """
        validated = preprocess_upload(data, declared_mime, self._settings)
        image = validated.image

        rek: Optional[RekognitionService] = self._registry.rekognition
        privacy: Optional[PrivacyService] = self._registry.privacy
        limit = max(1, self._settings.verify_concurrency_limit)
        semaphore = asyncio.Semaphore(limit)

        async def bounded(fn, *args):  # type: ignore[no-untyped-def]
            """Run a blocking model/API call off the event loop, bounded."""
            async with semaphore:
                return await asyncio.to_thread(fn, *args)

        # --- Rekognition: moderation + privacy signals (concurrent) --------- #
        rek_summary = RekognitionSummary(available=rek is not None)
        moderation: Optional[ModerationResult] = None
        faces: tuple[FaceRegion, ...] = ()
        texts: tuple[TextRegion, ...] = ()

        if rek is not None:
            source = encode_jpeg(image)
            mod_result, face_result, text_result = await asyncio.gather(
                bounded(rek.detect_moderation, source),
                bounded(rek.detect_faces, source, image.size),
                bounded(rek.detect_text, source, image.size),
            )
            moderation = mod_result
            faces, texts = face_result.faces, text_result.items
            rek_summary.moderation_status = mod_result.status
            rek_summary.moderation_labels = [label.name for label in mod_result.labels]
            rek_summary.faces_detected = len(faces)
            rek_summary.text_detections = len(texts)
            rek_summary.error = mod_result.error or face_result.error or text_result.error

        # --- Privacy pass: blur + separate storage ------------------------- #
        processed: Image.Image = image
        privacy_summary = PrivacySummary()
        if privacy is not None:
            processed, faces_blurred, plates_blurred = privacy.blur(image, faces, texts)
            original_ok, processed_ok = privacy.store(report_id, data, processed)
            privacy_summary = PrivacySummary(
                faces_blurred=faces_blurred,
                plates_blurred=plates_blurred,
                original_stored=original_ok,
                processed_stored=processed_ok,
            )

        # --- YOLO + Rekognition labels (concurrent on processed image) ----- #
        tasks: dict[str, asyncio.Task] = {
            "yolo": asyncio.create_task(bounded(self._run_detector, processed))
        }
        if rek is not None:
            tasks["labels"] = asyncio.create_task(
                bounded(rek.detect_labels, encode_jpeg(processed))
            )
        results = await asyncio.gather(*tasks.values())
        detections, yolo_error = results[0]
        label_idx = 1 if "labels" in tasks else None
        if label_idx is not None:
            label_result = results[label_idx]
            rek_summary.labels = [RekLabel(name=l.name, confidence=l.confidence) for l in label_result.labels]
            rek_summary.model_version = label_result.model_version
            if not rek_summary.error and label_result.error:
                rek_summary.error = label_result.error

        # --- SigLIP 2 zero-shot classification (on the processed image) ---- #
        siglip: SiglipSummary = SiglipSummary()
        classifier = self._registry.siglip
        if classifier is not None:
            if classifier.is_loaded:
                category, confidence, error = await bounded(classifier.classify, processed)
                siglip = SiglipSummary(
                    available=True,
                    predicted_category=category,
                    confidence=confidence,
                    model_id=classifier.model_id,
                    error=error,
                )
            else:
                siglip = SiglipSummary(
                    available=False,
                    model_id=classifier.model_id,
                    error=classifier.load_error,
                )

        # --- Azure Foundry vision judge (concurrent with SigLIP above) ----- #
        judge_summary = BedrockSummary()
        judge = self._registry.azure_judge
        if judge is not None and getattr(judge, "available", False):
            jr = await bounded(judge.judge, encode_jpeg(processed))
            judge_summary = BedrockSummary(
                available=jr.available,
                judgement=jr.judgement,
                reason=jr.reason,
                category=jr.category,
                model=jr.model,
                error=jr.error,
            )

        # --- Decision ------------------------------------------------------- #
        # No single (weak) model may hard-reject a report. Combine every signal
        # that actually ran; YOLO stays the strongest local one, but SigLIP
        # suggestions and the vision judge are honoured too.
        yolo_waste = bool(detections)
        siglip_waste = (
            siglip.available
            and siglip.predicted_category not in (None, "no_waste")
            and (siglip.confidence or 0.0) >= _SIGLIP_EVIDENCE_MIN_CONFIDENCE
        )
        judge_waste = judge_summary.available and judge_summary.judgement == "YES"
        is_waste_detected = yolo_waste or siglip_waste or judge_waste
        waste_category = report_type.value  # replaced by the Phase 5 engine
        decision = self._decide(yolo_waste, yolo_error, siglip, judge_summary)
        if moderation is not None and moderation.status == "flagged":
            # Moderation is *not* a waste verdict: flagged content must never
            # silently become an auto-rejection of the waste claim.
            if decision.result != "REVIEW_REQUIRED":
                decision = Decision(result="REVIEW_REQUIRED", confidence=None, reasons=list(decision.reasons))
            if _MODERATION_FLAG_REASON not in decision.reasons:
                decision.reasons.append(_MODERATION_FLAG_REASON)

        versions = dict(self._registry.model_versions())
        versions["rekognition"] = rek_summary.model_version
        return VerifyResponse(
            success=True,
            report_id=report_id,
            status=decision.result,
            is_waste_detected=is_waste_detected,
            waste_category=waste_category,
            detections=detections,
            rekognition=rek_summary,
            privacy=privacy_summary,
            siglip=siglip,
            bedrock=judge_summary,
            decision=decision,
            model_versions=ModelVersions(**versions),
        )

    # ------------------------------------------------------------------ #
    # POST /api/v1/detect (YOLO only)
    # ------------------------------------------------------------------ #
    async def detect(
        self,
        data: bytes,
        *,
        report_id: str,
        declared_mime: Optional[str],
        conf: Optional[float] = None,
        iou: Optional[float] = None,
    ) -> DetectResponse:
        """Run detection without the rest of the verification pipeline."""
        validated = preprocess_upload(data, declared_mime, self._settings)
        detector = self._registry.yolo

        if detector is None or not detector.is_loaded:
            return DetectResponse(
                success=False,
                report_id=report_id,
                detections=[],
                detector=YoloStatus(
                    available=False,
                    reason=(detector.load_error if detector else "not_loaded"),
                ),
                error="detector_unavailable",
            )

        detections, error = self._run_detector(validated.image, conf=conf, iou=iou)
        return DetectResponse(
            success=error is None,
            report_id=report_id,
            detections=detections,
            detector=detector.status(),
            error=error,
        )

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    def _run_detector(
        self,
        image: Image.Image,
        *,
        conf: Optional[float] = None,
        iou: Optional[float] = None,
    ) -> tuple[list[Detection], Optional[str]]:
        detector = self._registry.yolo
        if detector is None or not detector.is_loaded:
            reason = detector.load_error if detector else "not_configured"
            logger.warning("YOLO detector unavailable: %s", reason)
            return [], reason
        small = prepare_for_inference(image)
        return detector.predict(small, conf=conf, iou=iou)

    @staticmethod
    def _decide(
        yolo_waste: bool,
        detector_error: Optional[str],
        siglip: SiglipSummary,
        judge: Optional[BedrockSummary],
    ) -> Decision:
        """Conservative rule-based decision until the Phase 5 engine lands.

        YOLO boxes remain the strongest local evidence, but a report is never
        hard-rejected just because one weak model found nothing. Positive or
        uncertain secondary signals (vision judge, SigLIP 2) are routed to a
        human instead; only an explicit "no waste" from the judge or a clean
        negative from SigLIP confirms a rejection.
        """
        if detector_error:
            return Decision(result="REVIEW_REQUIRED", confidence=None, reasons=[_DETECTOR_DOWN_REASON])
        if yolo_waste:
            return Decision(result="REVIEW_REQUIRED", confidence=None, reasons=[_REVIEW_REASON])

        # YOLO saw nothing — consult the other components that actually ran.
        if judge is not None and judge.available:
            if judge.judgement == "YES":
                reason = f"Vision judge reports waste evidence ({judge.category or 'waste'})."
                if judge.reason:
                    reason += f" {judge.reason}"
                return Decision(result="REVIEW_REQUIRED", confidence=None, reasons=[reason])
            if judge.judgement == "NO":
                reason = _JUDGE_NO_REASON
                if judge.reason:
                    reason += f" {judge.reason}"
                return Decision(result="REJECTED", confidence=None, reasons=[reason])
            # UNCERTAIN / UNKNOWN / judge error — never auto-reject.
            reason = _JUDGE_UNCERTAIN_REASON
            if judge.error:
                reason += f" ({judge.error})"
            return Decision(result="REVIEW_REQUIRED", confidence=None, reasons=[reason])

        if (
            siglip.available
            and siglip.predicted_category not in (None, "no_waste")
            and (siglip.confidence or 0.0) >= _SIGLIP_EVIDENCE_MIN_CONFIDENCE
        ):
            reason = (
                f"SigLIP 2 suggests {siglip.predicted_category} "
                f"(relative score {siglip.confidence:.2f}); human verification required."
            )
            return Decision(result="REVIEW_REQUIRED", confidence=None, reasons=[reason])

        return Decision(result="REJECTED", confidence=None, reasons=[_NO_EVIDENCE_REASON])


__all__ = ["VerificationService"]
