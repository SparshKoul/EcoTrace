"""YOLO detector unit tests (fake model — no weights, no network)."""

from PIL import Image

from tests.conftest import FakeYoloDetector, make_test_image



def test_fake_detector_returns_detections() -> None:
    detector = FakeYoloDetector()
    image = Image.open(__import__("io").BytesIO(make_test_image()))
    detections, error = detector.predict(image)
    assert error is None
    assert len(detections) == 1
    det = detections[0]
    assert det.label == "bottle"
    assert det.class_id == 39
    assert 0.0 <= det.confidence <= 1.0
    assert len(det.bbox) == 4


def test_fake_detector_status_reflects_availability() -> None:
    ok = FakeYoloDetector()
    assert ok.status().available is True
    broken = FakeYoloDetector(error="weights missing")
    assert broken.status().available is False
    assert broken.status().reason == "weights missing"


def test_detector_unavailable_is_reported_not_raised() -> None:
    """A broken detector must degrade the response, not crash the pipeline."""
    from app.services.verification_service import VerificationService
    from tests.conftest import TEST_SETTINGS, make_registry

    from app.schemas.request import ReportType

    detector = FakeYoloDetector(error="cuda_init_failed")
    service = VerificationService(registry=make_registry(detector=detector), settings=TEST_SETTINGS)

    async def _run():
        return await service.verify(
            make_test_image(),
            report_id="ECO-9",
            report_type=ReportType.GARBAGE_DUMP,
            declared_mime="image/jpeg",
        )

    import anyio

    result = anyio.run(_run)
    assert result.success is True
    assert result.decision.result == "REVIEW_REQUIRED"
    assert any("Detector unavailable" in r for r in result.decision.reasons)


def test_yolo_module_imports_cleanly() -> None:
    """Importing the detector must not require ultralytics/torch at import time."""
    from app.models.yolo_detector import YoloDetector  # noqa: F401
