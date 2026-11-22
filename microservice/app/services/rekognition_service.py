"""Amazon Rekognition service (Phase 2): moderation, faces, labels, text.

Design notes
------------
* Credentials come from the **standard AWS credential provider chain**
  (local ``.env`` loaded into the process environment -> shell env ->
  ``~/.aws/credentials`` -> IAM role). Keys are never read from or written to
  source code.
* Every AWS response is normalised into small frozen dataclasses; every
  ``botocore`` failure is *classified* into a stable machine-readable code
  (``throttled``, ``access_denied``, ``timeout``, ...) instead of raising —
  the pipeline must degrade gracefully, never crash (spec 16.13).
* Rekognition provides **moderation + privacy signals only**. It never decides
  whether an image contains waste; moderation status is reported separately
  from the waste verdict (spec 5, 16).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

from botocore.config import Config as BotoConfig
from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    ConnectTimeoutError,
    ReadTimeoutError,
)

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)

PERCENT = 100.0  # Rekognition reports confidence in 0..100


# --------------------------------------------------------------------------- #
# Structured results (AWS responses converted to plain internal types)
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ModerationLabel:
    name: str
    confidence: float  # 0..1
    parent: Optional[str] = None


@dataclass(frozen=True)
class ModerationResult:
    """``status``: safe | flagged | unavailable."""

    status: str
    labels: tuple[ModerationLabel, ...] = ()
    error: Optional[str] = None


@dataclass(frozen=True)
class FaceRegion:
    """Face bounding box in pixels: [x1, y1, x2, y2]."""

    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float = 1.0


@dataclass(frozen=True)
class FaceResult:
    faces: tuple[FaceRegion, ...] = ()
    error: Optional[str] = None


@dataclass(frozen=True)
class TextRegion:
    """A detected text region in pixels (e.g. a vehicle registration plate)."""

    text: str
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float = 1.0
    kind: str = "LINE"


@dataclass(frozen=True)
class TextResult:
    items: tuple[TextRegion, ...] = ()
    error: Optional[str] = None


@dataclass(frozen=True)
class DetectedLabel:
    name: str
    confidence: float  # 0..1


@dataclass(frozen=True)
class LabelResult:
    labels: tuple[DetectedLabel, ...] = ()
    model_version: Optional[str] = None
    error: Optional[str] = None


# --------------------------------------------------------------------------- #
# Error classification
# --------------------------------------------------------------------------- #
_THROTTLE_CODES = {
    "ThrottlingException",
    "Throttling",
    "ProvisionedThroughputExceededException",
    "RequestLimitExceeded",
    "TooManyRequestsException",
    "SlowDown",
}
_ACCESS_CODES = {
    "AccessDeniedException",
    "UnauthorizedOperation",
    "UnrecognizedClientException",
    "InvalidSignatureException",
    "SignatureDoesNotMatch",
    "ExpiredTokenException",
    "TokenRefreshRequired",
}


def classify_error(exc: Exception) -> str:
    """Map an AWS/botocore exception to a stable, non-sensitive error code."""
    if isinstance(exc, ClientError):
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in _THROTTLE_CODES:
            return "throttled"
        if code in _ACCESS_CODES:
            return "access_denied"
        if code == "ImageTooLargeException":
            return "image_too_large"
        if code == "InvalidImageFormatException":
            return "invalid_image"
        if code == "InvalidParameterException":
            return "invalid_parameter"
        return "service_error"
    if isinstance(exc, (ConnectTimeoutError, ReadTimeoutError)):
        return "timeout"
    if isinstance(exc, BotoCoreError):
        return "connection_error"
    return "service_error"


# --------------------------------------------------------------------------- #
# Service
# --------------------------------------------------------------------------- #
class RekognitionService:
    """Thin, fault-tolerant wrapper around a boto3 Rekognition client.

    Methods return structured results with an ``error`` field instead of
    raising, so the pipeline can continue with whatever evidence is available.
    """

    def __init__(self, client: object, settings: Settings) -> None:
        self._client = client
        self._settings = settings

    # --- construction ------------------------------------------------------ #
    @classmethod
    def build(cls, settings: Settings) -> "RekognitionService":
        """Create the boto3 client via the standard credential provider chain.

        A local ``microservice/.env`` (git-ignored) may carry ``AWS_*`` for
        development; it is loaded into the process environment first so boto3
        picks it up. In production, use shell env / shared config / IAM role.
        """
        try:  # local dev convenience; absent file is fine
            from dotenv import load_dotenv

            load_dotenv()
        except Exception:  # pragma: no cover - dotenv optional at runtime
            pass
        import boto3

        config = BotoConfig(
            retries={"total_max_attempts": settings.aws_max_attempts, "mode": "standard"},
            connect_timeout=settings.aws_connect_timeout_seconds,
            read_timeout=settings.aws_read_timeout_seconds,
        )
        client = boto3.client("rekognition", region_name=settings.aws_region, config=config)
        return cls(client, settings)

    # --- calls ------------------------------------------------------------- #
    def detect_moderation(self, source: bytes) -> ModerationResult:
        """DetectModerationLabels -> safe/flagged, kept separate from waste verdict."""
        try:
            response = self._client.detect_moderation_labels(  # type: ignore[attr-defined]
                Image={"Bytes": source},
                MinConfidence=self._settings.aws_rekognition_min_confidence * PERCENT,
            )
        except (BotoCoreError, ClientError) as exc:
            return ModerationResult(status="unavailable", error=self._fail("moderation", exc))
        labels = tuple(
            ModerationLabel(
                name=item["Name"],
                confidence=float(item.get("Confidence", 0.0)) / PERCENT,
                parent=item.get("ParentName"),
            )
            for item in response.get("ModerationLabels", [])
            if "Name" in item
        )
        return ModerationResult(status="flagged" if labels else "safe", labels=labels)

    def detect_faces(self, source: bytes, size: tuple[int, int]) -> FaceResult:
        """DetectFaces -> pixel boxes for the privacy blur pass."""
        width, height = size
        try:
            response = self._client.detect_faces(  # type: ignore[attr-defined]
                Image={"Bytes": source}, Attributes=["DEFAULT"]
            )
        except (BotoCoreError, ClientError) as exc:
            return FaceResult(error=self._fail("faces", exc))
        faces = []
        for item in response.get("FaceDetails", []):
            box = item.get("BoundingBox")
            if not box:
                continue
            x1, y1, x2, y2 = _pixel_box(box, width, height)
            faces.append(
                FaceRegion(
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    confidence=float(item.get("Confidence", 100.0)) / PERCENT,
                )
            )
        return FaceResult(faces=tuple(faces))

    def detect_text(self, source: bytes, size: tuple[int, int]) -> TextResult:
        """DetectText -> line-level text regions (license-plate candidates)."""
        width, height = size
        try:
            response = self._client.detect_text(  # type: ignore[attr-defined]
                Image={"Bytes": source},
                Filters={"WordFilter": {"MinConfidence": self._settings.aws_rekognition_min_confidence * PERCENT}},
            )
        except (BotoCoreError, ClientError) as exc:
            return TextResult(error=self._fail("text", exc))
        items = []
        for det in response.get("TextDetections", []):
            # Line-level items carry the whole plate; WORD fragments are noise.
            if det.get("Type", "LINE") != "LINE" or "DetectedText" not in det:
                continue
            box = det.get("Geometry", {}).get("BoundingBox")
            if not box:
                continue
            x1, y1, x2, y2 = _pixel_box(box, width, height)
            items.append(
                TextRegion(
                    text=det["DetectedText"],
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    confidence=float(det.get("Confidence", 100.0)) / PERCENT,
                )
            )
        return TextResult(items=tuple(items))

    def detect_labels(self, source: bytes) -> LabelResult:
        """DetectLabels -> names + confidences (0..1) with model version."""
        try:
            response = self._client.detect_labels(  # type: ignore[attr-defined]
                Image={"Bytes": source},
                MaxLabels=self._settings.aws_rekognition_max_labels,
                MinConfidence=self._settings.aws_rekognition_min_confidence * PERCENT,
            )
        except (BotoCoreError, ClientError) as exc:
            return LabelResult(error=self._fail("labels", exc))
        labels = tuple(
            DetectedLabel(name=item["Name"], confidence=float(item.get("Confidence", 0.0)) / PERCENT)
            for item in response.get("Labels", [])
            if "Name" in item
        )
        return LabelResult(labels=labels, model_version=response.get("LabelModelVersion"))

    # --- helpers ------------------------------------------------------------ #
    @staticmethod
    def _fail(op: str, exc: Exception) -> str:
        code = classify_error(exc)
        logger.warning("rekognition_%s_failed code=%s", op, code)
        return code


# --------------------------------------------------------------------------- #
# Geometry helpers
# --------------------------------------------------------------------------- #
def _pixel_box(box: dict, width: int, height: int) -> tuple[int, int, int, int]:
    """AWS relative box {Left,Top,Width,Height} -> clamped pixel [x1,y1,x2,y2]."""
    left = int(round(float(box.get("Left", 0.0)) * width))
    top = int(round(float(box.get("Top", 0.0)) * height))
    w = int(round(float(box.get("Width", 0.0)) * width))
    h = int(round(float(box.get("Height", 0.0)) * height))
    x1 = max(0, min(left, width - 1))
    y1 = max(0, min(top, height - 1))
    x2 = max(x1 + 1, min(left + w, width))
    y2 = max(y1 + 1, min(top + h, height))
    return x1, y1, x2, y2


__all__ = [
    "RekognitionService",
    "classify_error",
    "ModerationLabel",
    "ModerationResult",
    "FaceRegion",
    "FaceResult",
    "TextRegion",
    "TextResult",
    "DetectedLabel",
    "LabelResult",
]
