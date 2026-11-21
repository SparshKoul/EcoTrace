"""Pydantic response schemas for the AI/ML microservice."""

from typing import Any, Optional

from pydantic import BaseModel, Field


class Detection(BaseModel):
    """A single detected object from the YOLO detector."""

    label: str
    class_id: int
    confidence: float = Field(..., ge=0.0, le=1.0)
    bbox: list[float] = Field(
        ..., min_length=4, max_length=4, description="[x1, y1, x2, y2] in pixels"
    )


class YoloStatus(BaseModel):
    """Availability metadata for the detector component."""

    available: bool
    model: Optional[str] = None
    device: Optional[str] = None
    reason: Optional[str] = None


class RekLabel(BaseModel):
    """A label detected by Amazon Rekognition DetectLabels (confidence 0..1)."""

    name: str
    confidence: float = Field(..., ge=0.0, le=1.0)


class RekognitionSummary(BaseModel):
    """Rekognition evidence: moderation is reported separately from waste
    verification and never decides the waste verdict on its own."""

    available: bool = False
    moderation_status: Optional[str] = None  # safe | flagged | unavailable
    moderation_labels: list[str] = Field(default_factory=list)
    labels: list[RekLabel] = Field(default_factory=list)
    faces_detected: int = 0
    text_detections: int = 0
    model_version: Optional[str] = None
    error: Optional[str] = None  # throttled | access_denied | timeout | ...


class PrivacySummary(BaseModel):
    """Result of the privacy pass: what was blurred and what was stored."""

    faces_blurred: int = 0
    plates_blurred: int = 0
    original_stored: bool = False
    processed_stored: bool = False


class SiglipSummary(BaseModel):
    """SigLIP 2 zero-shot classification result.

    ``confidence`` is a relative softmax score over candidate text prompts,
    NOT a calibrated probability or a trained classifier confidence.
    """

    available: bool = False
    predicted_category: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    model_id: Optional[str] = None
    error: Optional[str] = None


class BedrockSummary(BaseModel):
    """Vision-judge summary (Azure Foundry, Bedrock-compatible shape)."""

    available: bool = False
    judgement: Optional[str] = None  # YES | NO | UNCERTAIN | UNKNOWN
    reason: Optional[str] = None
    category: Optional[str] = None
    model: Optional[str] = None
    error: Optional[str] = None


class DecisionResult(str):
    """ACCEPTED | REJECTED | REVIEW_REQUIRED (plain str until Phase 5)."""

    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


class Decision(BaseModel):
    """Final decision-engine output (rule-based or stacked)."""

    result: str
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)


class ModelVersions(BaseModel):
    """Versions/identifiers of loaded models for traceability."""

    detector: Optional[str] = None
    classifier: Optional[str] = None
    rekognition: Optional[str] = None


class VerifyResponse(BaseModel):
    """Structured response returned to the Node.js backend."""

    success: bool
    report_id: str
    status: str
    is_waste_detected: bool
    waste_category: Optional[str] = None
    detections: list[Detection] = Field(default_factory=list)
    rekognition: RekognitionSummary = Field(default_factory=RekognitionSummary)
    privacy: PrivacySummary = Field(default_factory=PrivacySummary)
    siglip: SiglipSummary = Field(default_factory=SiglipSummary)
    bedrock: BedrockSummary = Field(default_factory=BedrockSummary)
    decision: Decision
    model_versions: ModelVersions = Field(default_factory=ModelVersions)
    error: Optional[str] = None


class DetectResponse(BaseModel):
    """Response for detection-only requests."""

    success: bool
    report_id: str
    detections: list[Detection] = Field(default_factory=list)
    detector: YoloStatus
    error: Optional[str] = None


class ErrorResponse(BaseModel):
    """Consistent error envelope for all failed requests."""

    success: bool = False
    error: str
    detail: Optional[str] = None


class HealthResponse(BaseModel):
    """Liveness probe response."""

    status: str = "ok"
    service: str
    version: str


class ReadyResponse(BaseModel):
    """Readiness probe response describing component availability."""

    status: str
    components: dict[str, Any] = Field(default_factory=dict)


class ModelInfoResponse(BaseModel):
    """Describes loaded models and their configuration."""

    models: dict[str, Any] = Field(default_factory=dict)


__all__ = [
    "Detection",
    "YoloStatus",
    "RekLabel",
    "RekognitionSummary",
    "PrivacySummary",
    "SiglipSummary",
    "BedrockSummary",
    "Decision",
    "DecisionResult",
    "ModelVersions",
    "VerifyResponse",
    "DetectResponse",
    "ErrorResponse",
    "HealthResponse",
    "ReadyResponse",
    "ModelInfoResponse",
]
