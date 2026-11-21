"""GET /health/ready and GET /api/v1/models — readiness & model inventory."""

from typing import Any

from fastapi import APIRouter, Request

from app.schemas.response import ModelInfoResponse, ReadyResponse

router = APIRouter(tags=["health"])


@router.get("/health/ready", response_model=ReadyResponse, summary="Readiness probe")
async def readiness(request: Request) -> ReadyResponse:
    """Reports per-component availability; the service itself stays 'ready'
    even when optional components are degraded (graceful degradation)."""
    registry = request.app.state.registry
    components = registry.component_status()
    core_ready = components.get("yolo", {}).get("available", False)
    status = "ready" if core_ready else "degraded"
    return ReadyResponse(status=status, components=components)


@router.get("/api/v1/models", response_model=ModelInfoResponse, summary="Loaded models")
async def list_models(request: Request) -> ModelInfoResponse:
    """Inventory of configured/loaded models and thresholds."""
    registry = request.app.state.registry
    settings = registry.settings
    yolo = registry.yolo
    models: dict[str, Any] = {
        "detector": {
            "type": "yolo",
            "model_path": settings.yolo_model_path,
            "device": settings.yolo_device_resolved,
            "conf_threshold": settings.yolo_conf_threshold,
            "iou_threshold": settings.yolo_iou_threshold,
            "loaded": bool(yolo and yolo.is_loaded),
            "class_count": len(getattr(yolo, "class_names", {}) or {}),
        },
        "classifier": {"type": "siglip2", "enabled": settings.siglip_enabled, "loaded": bool(registry.siglip)},
        "vision_llm": {
            "type": "bedrock",
            "model_id": settings.bedrock_model_id,
            "enabled": settings.bedrock_enabled,
            "loaded": bool(registry.bedrock),
        },
        "rekognition": {"enabled": settings.rekognition_enabled, "region": settings.aws_region},
    }
    return ModelInfoResponse(models=models)


__all__ = ["router"]
