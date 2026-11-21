"""Waste classes for the EcoTrace YOLO detector.

The pretrained COCO checkpoint has NO waste classes (no 'garbage bag',
'overflowing bin', ...). These are the classes a fine-tuned waste detector
must learn. Indices are stable — never reorder them after training starts.
"""

from __future__ import annotations

# (index, class name, report type it supports, example source labels)
WASTE_CLASSES: tuple[tuple[int, str, str, tuple[str, ...]], ...] = (
    (0, "plastic_waste", "plastic_waste", ("plastic bottle", "plastic bag", "bottle", "cup")),
    (1, "garbage_bag", "garbage_dump", ("garbage bag", "trash bag", "waste bag")),
    (2, "garbage_dump", "garbage_dump", ("garbage pile", "dump", "trash pile", "waste dump")),
    (3, "overflowing_bin", "overflowing_bin", ("overflowing bin", "full trash can", "bin")),
    (4, "construction_waste", "construction_waste", ("rubble", "debris", "construction waste")),
    (5, "burning_waste", "burning_waste", ("burning trash", "fire", "smoke")),
    (6, "other_waste", "other", ("litter", "can", "paper", "wrapper")),
)

NAMES: list[str] = [name for _idx, name, _rt, _ex in WASTE_CLASSES]

# Map source-dataset label text (lowercased) -> our class index.
_SOURCE_ALIASES: dict[str, int] = {}
for idx, _name, _rt, aliases in WASTE_CLASSES:
    for alias in aliases:
        _SOURCE_ALIASES[alias.lower()] = idx
# Common COCO names that are genuine waste proxies.
_SOURCE_ALIASES.update(
    {
        "bottle": 0,
        "wine glass": 0,
        "cup": 0,
        "plastic bottle": 0,
        "backpack": 6,
        "handbag": 6,
        "banana": 6,  # banana peel / organic litter proxy
    }
)


def class_id_for(label: str) -> int | None:
    """Return the waste class index for a source label, or None to skip it."""
    return _SOURCE_ALIASES.get(label.strip().lower())


__all__ = ["WASTE_CLASSES", "NAMES", "class_id_for"]
