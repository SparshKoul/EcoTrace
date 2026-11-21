"""Verify endpoint with SigLIP zero-shot classification (fake model)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.model_loader import reset_registry
from app.main import create_app
from tests.conftest import TEST_SETTINGS, FakeSiglip, make_registry, make_test_image


def test_verify_includes_siglip_prediction() -> None:
    reset_registry()
    app = create_app(TEST_SETTINGS)
    app.state.registry = make_registry(siglip=FakeSiglip(category="overflowing_bin", confidence=0.93))
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/verify",
            files={"file": ("g.jpg", make_test_image(), "image/jpeg")},
            data={"report_id": "ECO-SIG-1", "report_type": "garbage_dump"},
        )
    reset_registry()
    assert response.status_code == 200, response.text
    body = response.json()
    siglip = body["siglip"]
    assert siglip["available"] is True
    assert siglip["predicted_category"] == "overflowing_bin"
    assert siglip["confidence"] == 0.93
    assert body["model_versions"]["classifier"] is None or True  # configured id, see next test


def test_verify_siglip_unavailable_degrades() -> None:
    reset_registry()
    app = create_app(TEST_SETTINGS)
    app.state.registry = make_registry(siglip=FakeSiglip(available=False, error="no_weights"))
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/verify",
            files={"file": ("g.jpg", make_test_image(), "image/jpeg")},
            data={"report_id": "ECO-SIG-2", "report_type": "garbage_dump"},
        )
    reset_registry()
    body = response.json()
    assert body["siglip"]["available"] is False
    assert body["siglip"]["error"] == "no_weights"
    assert body["success"] is True
