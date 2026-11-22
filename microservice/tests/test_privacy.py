"""Privacy pass tests: plate regex, blur regions and separate storage."""

from __future__ import annotations

import os

import numpy as np
from PIL import Image

from app.services.privacy_service import PrivacyService
from app.services.rekognition_service import FaceRegion, TextRegion
from tests.conftest import TEST_SETTINGS


def _plate(text: str) -> TextRegion:
    return TextRegion(text=text, x1=20, y1=20, x2=140, y2=50)


def test_plate_regex_matches_indian_formats() -> None:
    for text in ("MH 12 AB 1234", "DL01C0123", "00 AB 1234", "mh-12-ab-1234"):
        assert PrivacyService.plate_regions([_plate(text)]), text


def test_plate_regex_rejects_ordinary_text() -> None:
    for text in ("HELLO WORLD", "GARBAGE DUMP", "12345", ""):
        assert PrivacyService.plate_regions([_plate(text)]) == [], text


def test_blur_changes_face_and_plate_regions_only() -> None:
    # Non-uniform pattern: Gaussian blur cannot change a flat-colour region.
    arr0 = np.zeros((100, 200, 3), dtype=np.uint8)
    for y in range(0, 100, 4):
        arr0[y : y + 2, :, :] = 255  # horizontal stripes everywhere
    image = Image.fromarray(arr0)
    face = FaceRegion(x1=10, y1=10, x2=60, y2=60)
    plate = _plate("MH 12 AB 1234")
    before = np.array(image).copy()

    processed, faces_done, plates_done = PrivacyService(TEST_SETTINGS).blur(image, (face,), (plate,))

    arr = np.array(processed)
    assert processed.size == image.size
    assert faces_done == 1 and plates_done == 1
    # Striped regions get smoothed; the untouched corner keeps its stripes.
    assert not np.array_equal(arr[20:50, 20:140], before[20:50, 20:140])
    assert np.array_equal(arr[94:100, 180:200], before[94:100, 180:200])


def test_blur_no_detections_returns_original_counts_zero() -> None:
    image = Image.new("RGB", (50, 50), (10, 20, 30))
    processed, f, p = PrivacyService(TEST_SETTINGS).blur(image, (), ())
    assert processed is image
    assert (f, p) == (0, 0)


def test_store_writes_original_and_processed_separately(tmp_path, monkeypatch) -> None:
    settings = TEST_SETTINGS.model_copy(
        update={
            "original_image_dir": str(tmp_path / "originals"),
            "processed_image_dir": str(tmp_path / "processed"),
        }
    )
    image = Image.new("RGB", (40, 40), (200, 100, 50))
    ok_orig, ok_proc = PrivacyService(settings).store("ECO-001", b"original-bytes", image)
    assert ok_orig and ok_proc
    original = tmp_path / "originals" / "ECO-001.orig"
    processed = tmp_path / "processed" / "ECO-001.jpg"
    assert original.read_bytes() == b"original-bytes"
    assert processed.exists()
    assert oct(os.stat(original).st_mode & 0o777) == "0o600"
    assert Image.open(processed).size == (40, 40)


def test_store_sanitises_report_id(tmp_path) -> None:
    settings = TEST_SETTINGS.model_copy(
        update={
            "original_image_dir": str(tmp_path / "o"),
            "processed_image_dir": str(tmp_path / "p"),
        }
    )
    PrivacyService(settings).store("../../evil/../id", b"x", Image.new("RGB", (10, 10)))
    assert list((tmp_path / "o").iterdir())[0].name == "______evil____id.orig"
