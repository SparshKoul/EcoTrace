"""Health and readiness endpoint tests."""

from fastapi.testclient import TestClient


def test_health_returns_ok(app_client: TestClient) -> None:
    response = app_client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "service" in body
    assert "version" in body


def test_health_ready_reports_components(app_client: TestClient) -> None:
    response = app_client.get("/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ready", "degraded"}
    components = body["components"]
    assert "yolo" in components and "rekognition" in components and "siglip" in components
    assert isinstance(components["yolo"]["available"], bool)
    assert body["status"] in {"ready", "degraded"}


def test_models_endpoint_lists_components(app_client: TestClient) -> None:
    response = app_client.get("/api/v1/models")
    assert response.status_code == 200
    models = response.json()["models"]
    assert models["detector"]["type"] == "yolo"
    # Fake detector is wired in for tests (or a real one in dev).
    assert isinstance(models["detector"]["loaded"], bool)
    assert "classifier" in models and "vision_llm" in models


def test_root_documentation_link(app_client: TestClient) -> None:
    response = app_client.get("/")
    assert response.status_code == 200
    assert response.json()["docs"] == "/docs"
