"""Full verification workflow tests with Rekognition + privacy (mocked AWS)."""

from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image

from app.core.model_loader import reset_registry
from app.main import create_app
from app.services.rekognition_service import FaceRegion, TextRegion
from tests.conftest import TEST_SETTINGS, FakeRekognition, make_registry, make_test_image


def _client_with(rekognition: FakeRekognition) -> TestClient:
    reset_registry()
    app = create_app(TEST_SETTINGS)
    app.state.registry = make_registry(rekognition=rekognition)
    from contextlib import asynccontextmanager

    original = app.router.lifespan_context

    @asynccontextmanager
    async def _preserve(app_):  # type: ignore[no-untyped-def]
        async with original(app_) as state:
            yield state

    app.router.lifespan_context = _preserve
    return TestClient(app)


def test_full_workflow_with_rekognition_and_privacy() -> None:
    rek = FakeRekognition(
        faces=(FaceRegion(x1=20, y1=20, x2=100, y2=100),),
        texts=(TextRegion(text="MH 12 AB 1234", x1=120, y1=20, x2=280, y2=60),),
        labels=(__import__("app.services.rekognition_service", fromlist=["DetectedLabel"]).DetectedLabel("Garbage", 0.88),),
    )
    with _client_with(rek) as client:
        response = client.post(
            "/api/v1/verify",
            files={"file": ("garbage.jpg", make_test_image(), "image/jpeg")},
            data={"report_id": "ECO-100", "report_type": "garbage_dump"},
        )
    reset_registry()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True
    assert body["rekognition"]["available"] is True
    assert body["rekognition"]["moderation_status"] == "safe"
    assert body["rekognition"]["faces_detected"] == 1
    assert body["rekognition"]["text_detections"] == 1
    assert body["rekognition"]["labels"][0]["name"] == "Garbage"
    assert body["rekognition"]["model_version"] == "3.0-fake"
    assert body["privacy"]["faces_blurred"] == 1
    assert body["privacy"]["plates_blurred"] == 1
    assert body["privacy"]["original_stored"] is True
    assert body["privacy"]["processed_stored"] is True
    assert body["status"] == "REVIEW_REQUIRED"
    assert set(rek.calls) == {"moderation", "faces", "text", "labels"}


def test_moderation_flagged_does_not_auto_reject_waste() -> None:
    rek = FakeRekognition(moderation_status="flagged")
    with _client_with(rek) as client:
        response = client.post(
            "/api/v1/verify",
            files={"file": ("g.jpg", make_test_image(), "image/jpeg")},
            data={"report_id": "ECO-101", "report_type": "garbage_dump"},
        )
    reset_registry()
    body = response.json()
    assert body["rekognition"]["moderation_status"] == "flagged"
    # YOLO found a bottle -> waste detected; flagged moderation adds a reason
    # but never flips the waste verdict.
    assert body["is_waste_detected"] is True
    assert body["status"] == "REVIEW_REQUIRED"
    assert any("flagged by moderation" in r for r in body["decision"]["reasons"])


def test_rekognition_failure_degrades_without_crashing() -> None:
    rek = FakeRekognition(
        moderation_error="throttled",
        face_error="access_denied",
        text_error="timeout",
        labels_error="throttled",
    )
    with _client_with(rek) as client:
        response = client.post(
            "/api/v1/verify",
            files={"file": ("g.jpg", make_test_image(), "image/jpeg")},
            data={"report_id": "ECO-102", "report_type": "garbage_dump"},
        )
    reset_registry()
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True
    assert body["rekognition"]["moderation_status"] == "unavailable"
    assert body["rekognition"]["error"] == "throttled"
    # YOLO evidence still yields a structured decision.
    assert body["decision"]["result"] == "REVIEW_REQUIRED"


def test_rekognition_disabled_still_serves_phase1_path() -> None:
    reset_registry()
    app = create_app(TEST_SETTINGS)
    app.state.registry = make_registry()  # no rekognition
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/verify",
            files={"file": ("g.jpg", make_test_image(), "image/jpeg")},
            data={"report_id": "ECO-103", "report_type": "garbage_dump"},
        )
    reset_registry()
    body = response.json()
    assert body["rekognition"]["available"] is False
    assert body["success"] is True
    assert body["decision"]["result"] == "REVIEW_REQUIRED"
