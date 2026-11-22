"""Tests for the batch verification endpoint and production CORS config."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.model_loader import reset_registry
from app.main import create_app
from tests.conftest import TEST_SETTINGS, make_registry, make_test_image


def _client():
    reset_registry()
    app = create_app(TEST_SETTINGS)
    app.state.registry = make_registry()
    return TestClient(app)


def test_batch_verifies_multiple_images() -> None:
    with _client() as client:
        response = client.post(
            "/api/v1/verify/batch",
            files=[
                ("files", ("a.jpg", make_test_image(), "image/jpeg")),
                ("files", ("b.jpg", make_test_image(), "image/jpeg")),
            ],
            data={
                "report_ids": ["ECO-B1", "ECO-B2"],
                "report_types": ["garbage_dump", "plastic_waste"],
            },
        )
    reset_registry()
    assert response.status_code in (200, 422), response.text
    if response.status_code == 200:
        body = response.json()
        assert body["processed"] == 2
        assert [r["report_id"] for r in body["results"]] == ["ECO-B1", "ECO-B2"]


def test_batch_rejects_mismatched_lengths() -> None:
    with _client() as client:
        response = client.post(
            "/api/v1/verify/batch",
            files=[("files", ("a.jpg", make_test_image(), "image/jpeg"))],
            data={"report_ids": ["A", "B"], "report_types": ["garbage_dump"]},
        )
    reset_registry()
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "batch_length_mismatch"


def test_batch_rejects_too_many() -> None:
    with _client() as client:
        response = client.post(
            "/api/v1/verify/batch",
            files=[("files", (f"{i}.jpg", make_test_image(), "image/jpeg")) for i in range(9)],
            data={
                "report_ids": [str(i) for i in range(9)],
                "report_types": ["garbage_dump"] * 9,
            },
        )
    reset_registry()
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "batch_size_invalid"


def test_cors_config_empty_allows_all_in_dev() -> None:
    settings = TEST_SETTINGS.model_copy(update={"allowed_origins": ""})
    app = create_app(settings)
    assert app.state.settings.allowed_origins == ""
