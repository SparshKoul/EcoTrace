"""Shared pytest fixtures.

The FastAPI app under test uses a *fake* detector so no network access or
model weights are required. AWS credentials are never needed for unit tests.
"""

from __future__ import annotations

import io
import os
from contextlib import asynccontextmanager
from typing import Any, Optional

import pytest
from PIL import Image

from app.core.config import Settings
from app.core.model_loader import ModelRegistry, load_models, reset_registry
from app.schemas.response import Detection, YoloStatus

# --- Test configuration ------------------------------------------------- #

# Environment prefixes that must never leak from the developer shell into tests.
_ENV_PREFIXES = ("YOLO_", "AWS_", "REKOGNITION_", "BEDROCK_", "SIGLIP_", "INTERNAL_", "MAX_", "APP_", "VERIFY_")
_ENV_EXACT = {"ENVIRONMENT", "LOG_LEVEL", "REQUEST_TIMEOUT_SECONDS"}


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Start every test from default settings, whatever the host machine has set
    (pattern borrowed from JunkSnap tests/unit/conftest.py)."""
    for name in list(os.environ):
        if name.startswith(_ENV_PREFIXES) or name in _ENV_EXACT:
            monkeypatch.delenv(name, raising=False)


TEST_SETTINGS = Settings(
    _env_file=None,  # ignore any local .env
    environment="development",
    internal_service_key="",  # auth disabled in unit tests
    max_upload_bytes=512 * 1024,  # 512 KiB cap for oversized-file tests
    yolo_enabled=False,  # real YOLO never loads in unit tests
    rekognition_enabled=False,
    bedrock_enabled=False,
    siglip_enabled=False,
)


class FakeYoloDetector:
    """Deterministic stand-in for :class:`app.models.yolo_detector.YoloDetector`.

    Implements exactly the interface the verification service consumes, so
    tests exercise real orchestration logic without model weights.
    """

    def __init__(
        self,
        detections: Optional[list[Detection]] = None,
        error: Optional[str] = None,
    ) -> None:
        self._detections = detections if detections is not None else [
            Detection(label="bottle", class_id=39, confidence=0.91, bbox=[100, 120, 300, 400])
        ]
        self._error = error
        self.model_path = "fake-yolo-for-tests"
        self.class_names = {39: "bottle"}
        self.device = "cpu"

    @property
    def is_loaded(self) -> bool:
        return self._error is None

    @property
    def load_error(self) -> Optional[str]:
        return self._error

    def load(self) -> bool:
        return self._error is None

    def predict(
        self, image: Any, *, conf: Optional[float] = None, iou: Optional[float] = None, max_det: Optional[int] = None
    ) -> tuple[list[Detection], Optional[str]]:
        if self._error:
            return [], self._error
        return list(self._detections), None

    def status(self) -> YoloStatus:
        return YoloStatus(
            available=self.is_loaded,
            model=self.model_path if self.is_loaded else None,
            device=self.device if self.is_loaded else None,
            reason=self._error,
        )


def make_registry(detector: Any = None) -> ModelRegistry:
    """Build a registry with a fake detector (default: one bottle detection)."""
    registry = load_models(TEST_SETTINGS)
    if detector is None:
        detector = FakeYoloDetector()
    registry.yolo = detector
    return registry


# --- Image helpers ------------------------------------------------------ #

def make_test_image(width: int = 320, height: int = 240, fmt: str = "JPEG") -> bytes:
    """Return encoded bytes for a small solid-colour test image."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(30, 120, 60)).save(buf, format=fmt)
    return buf.getvalue()


def make_large_image_bytes(width: int = 2000, height: int = 2000) -> bytes:
    """Return encoded bytes for an image big enough to exceed caps when needed."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(10, 10, 10)).save(buf, format="JPEG", quality=95)
    return buf.getvalue()


# --- App fixture -------------------------------------------------------- #

@pytest.fixture()
def settings() -> Settings:
    return TEST_SETTINGS


@pytest.fixture()
def app_client(settings: Settings):
    """FastAPI TestClient with a faked detector wired into the registry."""
    # Import here so Settings/env are already fixed by this module import order.
    from fastapi.testclient import TestClient

    from app.main import create_app

    reset_registry()
    registry = make_registry()
    application = create_app(settings)
    application.state.registry = registry
    # TestClient drives lifespan only via context manager; patch lifespan to
    # preserve our pre-wired fake registry (real load_models would override it).
    original_lifespan = application.router.lifespan_context

    @asynccontextmanager
    async def _preserving_lifespan(app_):  # type: ignore[no-untyped-def]
        async with original_lifespan(app_) as state:
            app_.state.registry = registry  # keep fakes after startup reload
            yield state

    application.router.lifespan_context = _preserving_lifespan
    with TestClient(application) as client:
        yield client
    reset_registry()


@pytest.fixture()
def fake_detector() -> FakeYoloDetector:
    return FakeYoloDetector()


__all__ = [
    "TEST_SETTINGS",
    "FakeYoloDetector",
    "make_registry",
    "make_test_image",
    "make_large_image_bytes",
]
