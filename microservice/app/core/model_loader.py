"""Application-startup model registry.

Models are expensive to load, so every component is loaded **once** here and
cached on the returned :class:`ModelRegistry`. ``main.py`` calls
``load_models()`` inside the FastAPI lifespan; tests can build a registry with
stub models instead.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.models.yolo_detector import YoloDetector

logger = get_logger(__name__)


@dataclass
class ModelRegistry:
    """Holds singleton model/service instances for the process lifetime."""

    settings: Settings
    yolo: Optional[YoloDetector] = None
    # Populated by later phases:
    siglip: Any = None
    rekognition: Any = None
    bedrock: Any = None
    decision_engine: Any = None
    extra: dict[str, Any] = field(default_factory=dict)

    def component_status(self) -> dict[str, Any]:
        """Map component name -> availability snapshot for /health/ready."""
        status: dict[str, Any] = {}
        if self.yolo is not None:
            status["yolo"] = self.yolo.status().model_dump()
        else:
            status["yolo"] = {"available": False, "reason": "not_loaded"}
        for name, component in (("siglip", self.siglip), ("bedrock", self.bedrock)):
            available = bool(getattr(component, "available", False)) if component else False
            status[name] = {"available": available}
        status["rekognition"] = {"available": bool(self.settings.rekognition_enabled)}
        return status

    def model_versions(self) -> dict[str, Optional[str]]:
        """Versions/identifiers for the response payload."""
        detector = self.yolo.model_path if (self.yolo and self.yolo.is_loaded) else None
        classifier = getattr(self.siglip, "model_id", None) if self.siglip else None
        return {"detector": detector, "classifier": classifier}


_registry: Optional[ModelRegistry] = None


def load_models(settings: Optional[Settings] = None) -> ModelRegistry:
    """Build and initialise the model registry (idempotent)."""
    global _registry
    if _registry is not None:
        return _registry

    settings = settings or get_settings()
    registry = ModelRegistry(settings=settings)

    # --- YOLO -------------------------------------------------------------
    if settings.yolo_enabled:
        detector = YoloDetector(
            settings.yolo_model_path,
            device=settings.yolo_device_resolved,
            conf_threshold=settings.yolo_conf_threshold,
            iou_threshold=settings.yolo_iou_threshold,
            max_detections=settings.yolo_max_detections,
        )
        detector.load()
        registry.yolo = detector
    else:
        logger.info("YOLO detector disabled via configuration.")

    # Later phases attach siglip / rekognition / bedrock / decision engine here.

    _registry = registry
    return registry


def get_registry() -> ModelRegistry:
    """Return the active registry (must call :func:`load_models` first)."""
    if _registry is None:
        return load_models()
    return _registry


def reset_registry() -> None:
    """Drop the cached registry — used by tests."""
    global _registry
    _registry = None


__all__ = ["ModelRegistry", "load_models", "get_registry", "reset_registry"]
