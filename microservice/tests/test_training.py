"""Training pipeline tests: class mapping, deterministic splits, dataset export,
and train/validate argument wiring (Ultralytics itself is never run)."""

from __future__ import annotations

import json

import pytest

from training.prepare_dataset import convert, split_of
from training.waste_classes import NAMES, class_id_for


def test_class_aliases_map_to_stable_ids() -> None:
    assert class_id_for("Garbage Bag") == 1
    assert class_id_for(" plastic bottle ") == 0
    assert class_id_for("overflowing bin") == 3
    assert class_id_for("unknown-thing") is None


def test_class_names_are_stable_and_unique() -> None:
    assert len(NAMES) == 7
    assert len(set(NAMES)) == 7
    assert NAMES[0] == "plastic_waste"


def test_split_is_deterministic() -> None:
    assert split_of("image-42") == split_of("image-42")
    assignments = {split_of(f"img-{i}") for i in range(200)}
    assert assignments <= {"train", "val", "test"}


def test_coco_conversion_writes_yolo_labels(tmp_path) -> None:
    images = tmp_path / "src"
    images.mkdir()
    (images / "a.jpg").write_bytes(b"fake-jpeg")
    ann = tmp_path / "ann.json"
    ann.write_text(
        json.dumps(
            {
                "categories": [{"id": 1, "name": "plastic bottle"}],
                "images": [{"id": 7, "file_name": "a.jpg", "width": 100, "height": 200}],
                "annotations": [
                    {"image_id": 7, "category_id": 1, "bbox": [10, 20, 40, 60], "iscrowd": 0}
                ],
            }
        )
    )
    out = tmp_path / "dataset"
    stats = convert(ann, images, out)
    assert stats["images"] == 1 and stats["boxes"] == 1
    split = split_of("7")
    label = (out / "labels" / split / "a.txt").read_text().strip()
    # x_center=(10+20)/100=0.3, y_center=(20+30)/200=0.25, w=0.4, h=0.3
    assert label == "0 0.300000 0.250000 0.400000 0.300000"
    assert (out / "data.yaml").exists()
    assert "nc: 7" in (out / "data.yaml").read_text()


def test_train_module_imports_without_ultralytics_call() -> None:
    from training.train_yolo import resolve_device

    assert resolve_device("cpu") == "cpu"


def test_validate_module_imports() -> None:
    from training.validate_yolo import parse_args  # noqa: F401


def test_dataset_yaml_matches_class_names() -> None:
    from pathlib import Path

    text = Path("datasets/waste.yaml").read_text()
    for name in NAMES:
        assert name in text
