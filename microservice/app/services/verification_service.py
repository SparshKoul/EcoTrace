"""Request-scoped verification orchestration.

Phase 1: validates the upload, runs YOLO, and produces a structured
verification response. Later phases attach Rekognition, Bedrock, SigLIP and
the decision engine as parallel tasks inside :meth:`VerificationService.verify`.
"""

from __future__ import annotations

from typing import Optional

from PIL import Image

from app.core.config import Settings
from app.core.logging import get_logger
from app.core.model_loader import ModelRegistry, get_registry
from app.schemas.request import ReportType
from app.schemas.response import (
    Decision,
    Detection,
    DetectResponse,
    ModelVersions,
    VerifyResponse,
    YoloStatus,
)
from app.services.image_processing import prepare_for_inference, preprocess_upload
from app.utils.image_utils import ImageValidationError

logger = get_logger(__name__)

# Until Phase 5 introduces a real decision engine, verification defaults to
# REVIEW_REQUIRED whenever waste evidence exists — never a fabricated ACCEPTED.
_NO_EVIDENCE_REASON = "No waste evidence detected by available models."
_REVIEW_REASON = "Human verification required"
_DETECTOR_DOWN_REASON = "Detector unavailable; evidence incomplete"


class VerificationService:
    """Coordinates image validation, model inference and response assembly."""

    def __init__(self, registry: Optional[ModelRegistry] = None, settings: Optional[Settings] = None):
        # Explicit registry (from app.state) wins so tests can inject fakes.
        self._registry = registry if registry is not None else get_registry()
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
        """Run the full Phase 1 verification pipeline.

        Raises:
            ImageValidationError: when the upload itself is invalid — routes
                translate this into an HTTP error response.
        """
        validated = preprocess_upload(data, declared_mime, self._settings)

        # Phase 1: YOLO only. Phases 2–4 add Rekognition (moderation +
        # privacy), SigLIP and Bedrock here — safe to run concurrently since
        # they are independent.
        detections, yolo_error = self._run_detector(validated.image)

        is_waste_detected = bool(detections)
        waste_category = self._derive_category(report_type, detections)
        decision = self._decide(is_waste_detected, yolo_error)

        return VerifyResponse(
            success=True,
            report_id=report_id,
            status=decision.result,
            is_waste_detected=is_waste_detected,
            waste_category=waste_category,
            detections=detections,
            decision=decision,
            model_versions=ModelVersions(**self._registry.model_versions()),
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
    def _derive_category(report_type: ReportType, detections: list[Detection]) -> str:
        """Map detections to a waste category.

        Phase 1 heuristic: use the reporter's claimed category when objects
        are present; later phases replace this with the decision engine's
        category (SigLIP + Bedrock).
        """
        if not detections:
            return report_type.value
        return report_type.value

    @staticmethod
    def _decide(is_waste_detected: bool, detector_error: Optional[str]) -> Decision:
        """Conservative rule-based decision until the Phase 5 engine lands.

        Rules (documented, evidence-based — no invented confidences):

        * Detector failed  -> REVIEW_REQUIRED: absence of detections is not
          evidence of absence when the detector itself errored.
        * No detections     -> REJECTED with a transparent reason.
        * Detections found -> REVIEW_REQUIRED: a generic detector's output is
          not sufficient to auto-accept a waste report.
        """
        if detector_error:
            return Decision(
                result="REVIEW_REQUIRED",
                confidence=None,
                reasons=[_DETECTOR_DOWN_REASON],
            )
        if not is_waste_detected:
            return Decision(
                result="REJECTED",
                confidence=None,
                reasons=[_NO_EVIDENCE_REASON],
            )
        return Decision(
            result="REVIEW_REQUIRED",
            confidence=None,
            reasons=[_REVIEW_REASON],
        )


__all__ = ["VerificationService"]
