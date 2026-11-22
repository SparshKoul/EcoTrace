"""FastAPI application entrypoint for the EcoTrace AI/ML microservice.

Run locally:
    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger
from app.core.model_loader import load_models, reset_registry
from app.routes import health, models, verify

logger = get_logger(__name__)

SERVICE_VERSION = "0.1.0-phase1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Load models once at startup; release resources at shutdown."""
    settings: Settings = app.state.settings
    configure_logging(settings.log_level)
    logger.info("Starting %s (%s) in %s mode", settings.app_name, SERVICE_VERSION, settings.environment)
    registry = load_models(settings)
    app.state.registry = registry
    yolo = registry.yolo
    logger.info(
        "Startup complete — YOLO: %s",
        "loaded" if (yolo and yolo.is_loaded) else f"unavailable ({getattr(yolo, 'load_error', 'disabled')})",
    )
    try:
        yield
    finally:
        logger.info("Shutting down; releasing model registry.")
        reset_registry()


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """Application factory (used by tests to inject configuration)."""
    settings = settings or get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=SERVICE_VERSION,
        description=(
            "AI/ML verification microservice for EcoTrace. "
            "Accepts waste-report images and returns structured verification "
            "results. Owns no application database and no user authentication."
        ),
        lifespan=lifespan,
    )
    app.state.settings = settings

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        """Consistent 422 envelope that tells the caller *what* was missing."""
        errors = []
        for err in exc.errors():
            loc = ".".join(str(part) for part in err.get("loc", []))
            errors.append({"field": loc or "body", "message": err.get("msg", "invalid")})
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error": "validation_error",
                "detail": "Request validation failed — use multipart/form-data.",
                "fields": errors,
            },
        )

    # In production only the Node.js backend origin is allowed. For local
    # development (no origins configured) all origins are permitted.
    allowed_origins = [
        origin.strip()
        for origin in getattr(settings, "allowed_origins", "").split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins or ["*"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    # --- Internal service authentication -------------------------------- #
    internal_key = settings.internal_service_key

    @app.middleware("http")
    async def enforce_internal_auth(request: Request, call_next):  # type: ignore[no-untyped-def]
        # Health probes stay unauthenticated for orchestrators.
        if internal_key and request.url.path not in ("/health", "/health/ready", "/docs", "/openapi.json"):
            supplied = request.headers.get("X-Internal-Service-Key", "")
            if supplied != internal_key:
                return JSONResponse(
                    status_code=401,
                    content={"success": False, "error": "unauthorized", "detail": "Invalid or missing service key."},
                )
        # Per-request timing for observability.
        start = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - start) * 1000:.1f}"
        return response

    # --- Routes ----------------------------------------------------------- #
    app.include_router(health.router)
    app.include_router(models.router)
    app.include_router(verify.router)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {"service": settings.app_name, "version": SERVICE_VERSION, "docs": "/docs"}

    return app


app = create_app()

__all__ = ["app", "create_app"]
