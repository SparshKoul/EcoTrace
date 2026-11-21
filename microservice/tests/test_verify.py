"""POST /api/v1/verify and /api/v1/detect — full workflow and validation tests."""

import io

from fastapi.testclient import TestClient

from tests.conftest import make_test_image


def _upload(client: TestClient, **kwargs) -> dict:  # type: ignore[no-untyped-def]
    response = client.post("/api/v1/verify", **kwargs)
    assert response.status_code == 200, response.text
    return response.json()


def test_verify_happy_path_with_detection(app_client: TestClient) -> None:
    body = _upload(
        app_client,
        files={"file": ("garbage.jpg", make_test_image(), "image/jpeg")},
        data={"report_id": "ECO-001", "report_type": "garbage_dump"},
    )
    assert body["success"] is True
    assert body["report_id"] == "ECO-001"
    assert body["is_waste_detected"] is True
    assert len(body["detections"]) == 1
    det = body["detections"][0]
    assert det["label"] == "bottle"
    assert 0.0 <= det["confidence"] <= 1.0
    assert len(det["bbox"]) == 4
    # Conservative Phase 1 decision — never fabricated ACCEPTED.
    assert body["status"] == "REVIEW_REQUIRED"
    assert body["decision"]["result"] == "REVIEW_REQUIRED"
    assert body["decision"]["confidence"] is None
    # The fake detector's identifier, or the configured path when a real
    # detector was wired in — both are honest model identifiers.
    assert body["model_versions"]["detector"] is not None
    # Phase 2+ components are honestly reported as unavailable.
    assert body["rekognition"]["available"] is False
    assert body["siglip"]["available"] is False
    assert body["bedrock"]["available"] is False


def test_verify_rejects_invalid_mime_type(app_client: TestClient) -> None:
    response = app_client.post(
        "/api/v1/verify",
        files={"file": ("payload.txt", b"not an image at all", "text/plain")},
        data={"report_id": "ECO-002", "report_type": "other"},
    )
    assert response.status_code == 415
    detail = response.json()["detail"]
    assert detail["success"] is False
    assert detail["error"] in {"unsupported_mime_type", "invalid_file_signature"}


def test_verify_rejects_spoofed_content_type(app_client: TestClient) -> None:
    """JPEG magic bytes declared as image/png must be refused."""
    response = app_client.post(
        "/api/v1/verify",
        files={"file": ("fake.png", make_test_image(), "image/png")},
        data={"report_id": "ECO-003", "report_type": "other"},
    )
    assert response.status_code == 415
    assert response.json()["detail"]["error"] == "mime_mismatch"


def test_verify_rejects_oversized_file(app_client: TestClient) -> None:
    # Test cap is 512 KiB: valid JPEG header + padding exceeds it (413 must
    # trigger before decode, so content after the header never matters).
    payload = make_test_image(width=40, height=40) + b"\x00" * (700 * 1024)
    response = app_client.post(
        "/api/v1/verify",
        files={"file": ("big.jpg", payload, "image/jpeg")},
        data={"report_id": "ECO-004", "report_type": "garbage_dump"},
    )
    assert response.status_code == 413
    assert response.json()["detail"]["error"] == "file_too_large"


def test_verify_rejects_empty_file(app_client: TestClient) -> None:
    response = app_client.post(
        "/api/v1/verify",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
        data={"report_id": "ECO-005", "report_type": "other"},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "empty_file"


def test_verify_missing_required_fields(app_client: TestClient) -> None:
    response = app_client.post(
        "/api/v1/verify",
        files={"file": ("g.jpg", make_test_image(), "image/jpeg")},
        data={"report_type": "garbage_dump"},  # report_id missing
    )
    assert response.status_code == 422


def test_verify_invalid_report_type(app_client: TestClient) -> None:
    response = app_client.post(
        "/api/v1/verify",
        files={"file": ("g.jpg", make_test_image(), "image/jpeg")},
        data={"report_id": "ECO-006", "report_type": "not_a_real_type"},
    )
    assert response.status_code == 422


def test_detect_endpoint_returns_detections(app_client: TestClient) -> None:
    response = app_client.post(
        "/api/v1/detect",
        files={"file": ("g.jpg", make_test_image(), "image/jpeg")},
        data={"report_id": "ECO-007"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True
    assert body["detector"]["available"] is True
    assert body["detector"]["model"] is not None
    assert len(body["detections"]) == 1


def test_detect_endpoint_reports_unavailable_detector() -> None:
    import anyio

    from app.services.verification_service import VerificationService
    from tests.conftest import TEST_SETTINGS, FakeYoloDetector, make_registry

    service = VerificationService(
        registry=make_registry(detector=FakeYoloDetector(error="model_not_found")),
        settings=TEST_SETTINGS,
    )

    async def _run():
        return await service.detect(
            make_test_image(),
            report_id="ECO-008",
            declared_mime="image/jpeg",
        )

    import anyio

    result = anyio.run(_run)
    assert result.success is False
    assert result.error == "detector_unavailable"
    assert result.detector.available is False
    assert result.detector.reason == "model_not_found"
