"""Convert a COCO-style annotation JSON (TACO, Roboflow COCO export, etc.)
into YOLO-format images/labels with deterministic train/val/test splits.

Usage:
    python -m training.prepare_dataset --source taco \
        --annotations /path/to/TACO/annotations.json \
        --images /path/to/TACO/images --out datasets/waste

No images are downloaded — point --images at an existing image directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from app.core.logging import configure_logging, get_logger
from training.waste_classes import NAMES, class_id_for

logger = get_logger(__name__)

# Hash-based split (pattern from the reference project): an image's split is
# stable when more images are added later.
def split_of(image_id: str) -> str:
    value = int(hashlib.sha256(f"ecotrace-v1:{image_id}".encode()).hexdigest()[:8], 16) / 2**32
    if value < 0.1:
        return "test"
    if value < 0.2:
        return "val"
    return "train"


def convert(annotations: Path, images: Path, out: Path, limit: int = 0) -> dict[str, int]:
    """Read COCO JSON, write YOLO labels + image symlinks/copies and data.yaml."""
    data: dict[str, Any] = json.loads(annotations.read_text(encoding="utf-8"))
    categories = {c["id"]: c["name"] for c in data.get("categories", [])}

    stats: dict[str, int] = {"images": 0, "boxes": 0, "skipped": 0, "train": 0, "val": 0, "test": 0}
    for split in ("train", "val", "test"):
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)

    by_image: dict[int, list[tuple[int, list[float]]]] = {}
    for ann in data.get("annotations", []):
        cat = categories.get(ann.get("category_id"), "")
        cls = class_id_for(cat)
        if cls is None or ann.get("iscrowd"):
            stats["skipped"] += 1
            continue
        bbox = ann.get("bbox")  # [x, y, w, h] in pixels
        if not bbox or bbox[2] <= 0 or bbox[3] <= 0:
            stats["skipped"] += 1
            continue
        by_image.setdefault(ann["image_id"], []).append((cls, bbox))

    for image in data.get("images", []):
        if limit and stats["images"] >= limit:
            break
        image_id = image["id"]
        boxes = by_image.get(image_id, [])
        if not boxes:  # background images are useful too, but skip to keep it simple
            stats["skipped"] += 1
            continue
        src = images / image["file_name"]
        if not src.exists():
            stats["skipped"] += 1
            continue
        split = split_of(str(image_id))
        stem = Path(image["file_name"]).stem
        dst_img = out / "images" / split / f"{stem}.jpg"
        if not dst_img.exists():
            try:
                dst_img.hardlink_to(src)
            except OSError:
                shutil.copyfile(src, dst_img)
        w, h = float(image["width"]), float(image["height"])
        lines = []
        for cls, (x, y, bw, bh) in boxes:
            lines.append(
                f"{cls} {(x + bw / 2) / w:.6f} {(y + bh / 2) / h:.6f} {bw / w:.6f} {bh / h:.6f}\n"
            )
            stats["boxes"] += 1
        (out / "labels" / split / f"{stem}.txt").write_text("".join(lines), encoding="utf-8")
        stats["images"] += 1
        stats[split] += 1

    names = "\n".join(f"  {i}: {name}" for i, name in enumerate(NAMES))
    (out / "data.yaml").write_text(
        f"path: {out.resolve().as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\n"
        f"nc: {len(NAMES)}\nnames:\n{names}\n",
        encoding="utf-8",
    )
    logger.info("Prepared dataset: %s", stats)
    return stats


def main() -> None:
    configure_logging("INFO")
    p = argparse.ArgumentParser(description="COCO/TACO -> EcoTrace YOLO dataset")
    p.add_argument("--source", default="taco", choices=("taco", "coco", "roboflow"))
    p.add_argument("--annotations", required=True, type=Path)
    p.add_argument("--images", required=True, type=Path)
    p.add_argument("--out", type=Path, default=Path("datasets/waste"))
    p.add_argument("--limit", type=int, default=0, help="Max images (0 = all); useful for a smoke run")
    args = p.parse_args()
    convert(args.annotations, args.images, args.out, args.limit)


if __name__ == "__main__":
    main()
