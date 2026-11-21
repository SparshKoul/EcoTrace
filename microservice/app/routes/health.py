"""GET /health — liveness probe."""

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.response import HealthResponse

router = APIRouter(tags=["health"])

SERVICE_VERSION = "0.1.0-phase1"


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    """Cheap liveness check — confirms the process is serving requests."""
    settings = get_settings()
    return HealthResponse(status="ok", service=settings.app_name, version=SERVICE_VERSION)


__all__ = ["router"]
