"""Regression tests: validation errors return a consistent, descriptive envelope."""

from fastapi.testclient import TestClient

from app.core.model_loader import reset_registry
from app.main import create_app
from tests.conftest import TEST_SETTINGS, make_registry, make_test_image


def _client() -> TestClient:
    reset_registry()
    app = create_app(TEST_SETTINGS)
    app.state.registry = make_registry()
    return TestClient(app)


def test_json_body_gets_descriptive_422() -> None:
    with _client() as client:
        response = client.post(
            "/api/v1/verify",
            json={"file": "x", "report_id": "E1", "report_type": "garbage_dump"},
        )
    reset_registry()
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["error"] == "validation_error"
    assert "multipart/form-data" in body["detail"]
    missing = {e["field"] for e in body["fields"]}
    assert {"body.file", "body.report_id", "body.report_type"} <= missing


def test_missing_field_gets_field_name() -> None:
    with _client() as client:
        response = client.post(
            "/api/v1/verify",
            files={"file": ("g.jpg", make_test_image(), "image/jpeg")},
            data={"report_id": "E1"},
        )
    reset_registry()
    assert response.status_code == 422
    assert any(e["field"] == "body.report_type" for e in response.json()["fields"])
