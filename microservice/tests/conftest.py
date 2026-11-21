"""Shared pytest fixtures.

The FastAPI app under test uses a *fake* detector so no network access or
model weights are required. AWS credentials are never needed for unit tests.
"""

from __future__ import annotations

import io
import os
import tempfile
from contextlib import asynccontextmanager
from typing import Any, Optional

import pytest
from PIL import Image

from app.core.config import Settings
from app.core.model_loader import ModelRegistry, load_models, reset_registry
from app.schemas.response import Detection, YoloStatus
from app.services.azure_judge_service import JudgeResult

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
    rekognition_enabled=False,  # no AWS calls in unit tests
    bedrock_enabled=False,
    siglip_enabled=False,
    azure_judge_enabled=False,  # no real HTTP in unit tests
    aws_region="ap-south-1",
    original_image_dir=tempfile.mkdtemp(prefix="ecotrace-orig-"),
    processed_image_dir=tempfile.mkdtemp(prefix="ecotrace-proc-"),
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


class FakeSiglip:
    """Deterministic zero-shot classifier fake — no model download."""

    def __init__(
        self,
        category: str = "plastic_waste",
        confidence: float = 0.87,
        *,
        available: bool = True,
        error: str | None = None,
    ) -> None:
        self.model_id = "fake-siglip-for-tests"
        self.predicted = category
        self.score = confidence
        self.load_error = error
        self._available = available

    @property
    def is_loaded(self) -> bool:
        return self._available

    def classify(self, image):
        if not self._available:
            return None, None, self.load_error or "siglip_unavailable"
        return self.predicted, self.score, None


class FakeJudge:
    """Deterministic vision-judge fake — no HTTP calls."""

    def __init__(
        self,
        *,
        available: bool = True,
        judgement: str = "YES",
        reason: str | None = None,
        category: str | None = None,
        error: str | None = None,
    ) -> None:
        self.available = available
        self.judgement = judgement
        self.reason = reason
        self.category = category
        self.model = "fake-judge"
        self.error = error

    def judge(self, image: bytes) -> JudgeResult:
        return JudgeResult(
            available=self.available,
            judgement=self.judgement,
            reason=self.reason,
            category=self.category,
            model=self.model,
            error=self.error,
        )


class FakeRekognition:
    """Deterministic Rekognition fake — no boto3 client, no AWS credentials.

    Mirrors the interface the verification service calls; all methods are
    synchronous (the service runs them in a threadpool).
    """

    def __init__(
        self,
        *,
        moderation_status: str = "safe",
        moderation_error: Optional[str] = None,
        labels_error: Optional[str] = None,
        face_error: Optional[str] = None,
        text_error: Optional[str] = None,
        faces: tuple = (),
        texts: tuple = (),
        labels: tuple = (),
    ) -> None:
        self._status = moderation_status
        self._moderation_error = moderation_error
        self._labels_error = labels_error
        self._face_error = face_error
        self._text_error = text_error
        self._faces = faces
        self._texts = texts
        self._labels = labels
        self.calls: list[str] = []

    def detect_moderation(self, source: bytes):
        from app.services.rekognition_service import ModerationResult

        self.calls.append("moderation")
        status = "unavailable" if self._moderation_error else self._status
        return ModerationResult(status=status, error=self._moderation_error)

    def detect_faces(self, source: bytes, size: tuple[int, int]):
        from app.services.rekognition_service import FaceResult

        self.calls.append("faces")
        return FaceResult(faces=self._faces, error=self._face_error)

    def detect_text(self, source: bytes, size: tuple[int, int]):
        from app.services.rekognition_service import TextResult

        self.calls.append("text")
        return TextResult(items=self._texts, error=self._text_error)

    def detect_labels(self, source: bytes):
        from app.services.rekognition_service import LabelResult

        self.calls.append("labels")
        return LabelResult(labels=self._labels, model_version="3.0-fake", error=self._labels_error)


def make_registry(
    detector: Any = None,
    *,
    rekognition: Any = None,
    privacy: bool = True,
    siglip: Any = None,
    azure_judge: Any = None,
) -> ModelRegistry:
    """Build a registry with fakes (default: one bottle detection, no AWS)."""
    registry = load_models(TEST_SETTINGS)
    registry.yolo = detector if detector is not None else FakeYoloDetector()
    registry.rekognition = rekognition
    registry.siglip = siglip
    registry.azure_judge = azure_judge
    if not privacy:
        registry.privacy = None
    elif registry.privacy is None:
        from app.services.privacy_service import PrivacyService

        registry.privacy = PrivacyService(TEST_SETTINGS)
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
    "FakeRekognition",
    "FakeSiglip",
    "FakeJudge",
    "make_registry",
    "make_test_image",
    "make_large_image_bytes",
]
