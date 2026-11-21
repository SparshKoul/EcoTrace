"""Decision-engine tests: the verdict must use all available evidence.

Regression case: a trash photo where the general-purpose YOLO checkpoint finds
no COCO objects but SigLIP 2 reports a weak waste suggestion. This used to be
hard-REJECTED because only YOLO boxes fed the decision.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.model_loader import reset_registry
from app.main import create_app
from tests.conftest import (
    TEST_SETTINGS,
    FakeJudge,
    FakeSiglip,
    FakeYoloDetector,
    make_registry,
    make_test_image,
)


def _verify(
    *,
    detections=None,  # type: ignore[no-untyped-def]
    detector_error: str | None = None,
    siglip=None,  # type: ignore[no-untyped-def]
    judge=None,  # type: ignore[no-untyped-def]
) -> dict:  # type: ignore[no-untyped-def]
    reset_registry()
    registry = make_registry(
        detector=FakeYoloDetector(detections=detections, error=detector_error),
        siglip=siglip,
        azure_judge=judge,
    )
    app = create_app(TEST_SETTINGS)
    app.state.registry = registry
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/verify",
                files={"file": ("trash.jpg", make_test_image(), "image/jpeg")},
                data={"report_id": "ECO-DEC", "report_type": "garbage_dump"},
            )
    finally:
        reset_registry()
    assert response.status_code == 200, response.text
    return response.json()


def test_weak_siglip_suggestion_routes_to_review_not_rejection() -> None:
    """The exact reported failure: no YOLO boxes, SigLIP at 0.205."""
    body = _verify(
        detections=[],
        siglip=FakeSiglip(category="construction_waste", confidence=0.205),
    )
    assert body["detections"] == []
    assert body["siglip"]["predicted_category"] == "construction_waste"
    assert body["status"] == "REVIEW_REQUIRED"
    assert body["is_waste_detected"] is True
    assert any("SigLIP 2 suggests construction_waste" in r for r in body["decision"]["reasons"])


def test_siglip_no_waste_confirms_rejection() -> None:
    body = _verify(
        detections=[],
        siglip=FakeSiglip(category="no_waste", confidence=0.91),
    )
    assert body["status"] == "REJECTED"
    assert body["is_waste_detected"] is False


def test_siglip_below_evidence_floor_confirms_rejection() -> None:
    body = _verify(
        detections=[],
        siglip=FakeSiglip(category="plastic_waste", confidence=0.05),
    )
    assert body["status"] == "REJECTED"
    assert body["is_waste_detected"] is False


def test_exact_reported_case_judge_yes_no_yolo_boxes_not_rejected() -> None:
    """Regression: the user's pasted response (judge YES, no detections,
    SigLIP 0.205) must NEVER be REJECTED with 'no waste evidence'."""
    body = _verify(
        detections=[],
        siglip=FakeSiglip(category="construction_waste", confidence=0.2050967663526535),
        judge=FakeJudge(
            judgement="YES",
            reason="The image shows a large pile of mixed garbage and plastic in a landfill setting indicating a waste dump.",
            category="a_waste_dump",
        ),
    )
    assert body["bedrock"]["judgement"] == "YES"
    assert body["is_waste_detected"] is True
    assert body["status"] != "REJECTED", "Judge YES with no boxes must not be REJECTED"
    assert any("Vision judge reports waste evidence" in r for r in body["decision"]["reasons"])
    assert "No waste evidence detected by available models." not in body["decision"]["reasons"]


def test_judge_yes_routes_to_review() -> None:
    body = _verify(
        detections=[],
        judge=FakeJudge(judgement="YES", category="garbage_dump", reason="Visible trash pile"),
    )
    assert body["status"] == "REVIEW_REQUIRED"
    assert body["is_waste_detected"] is True
    assert any("Vision judge reports waste evidence" in r for r in body["decision"]["reasons"])


def test_judge_no_rejects_with_its_reason() -> None:
    body = _verify(
        detections=[],
        judge=FakeJudge(judgement="NO", reason="Image shows a clean street"),
    )
    assert body["status"] == "REJECTED"
    assert body["is_waste_detected"] is False
    assert any("clean street" in r for r in body["decision"]["reasons"])


def test_judge_uncertain_routes_to_review() -> None:
    body = _verify(detections=[], judge=FakeJudge(judgement="UNCERTAIN"))
    assert body["status"] == "REVIEW_REQUIRED"
    assert body["is_waste_detected"] is False
    assert any("could not confirm" in r for r in body["decision"]["reasons"])


def test_no_evidence_at_all_still_rejects() -> None:
    body = _verify(detections=[])
    assert body["status"] == "REJECTED"
    assert body["decision"]["reasons"] == ["No waste evidence detected by available models."]


def test_detector_error_still_routes_to_review() -> None:
    body = _verify(detector_error="model_not_found")
    assert body["status"] == "REVIEW_REQUIRED"
    assert any("Detector unavailable" in r for r in body["decision"]["reasons"])


def test_yolo_detection_wins_over_siglip_negative() -> None:
    body = _verify(siglip=FakeSiglip(category="no_waste", confidence=0.9))
    assert body["detections"]
    assert body["status"] == "REVIEW_REQUIRED"
    assert body["is_waste_detected"] is True
