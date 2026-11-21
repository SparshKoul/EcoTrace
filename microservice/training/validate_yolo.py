"""Validate a trained waste detector: precision, recall, mAP50, mAP50-95,
confusion matrix. Prints a compact report and saves plots into the run dir.

Usage:
    python -m training.validate_yolo --weights weights/waste_yolo/waste_yolo_v1/weights/best.pt
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.core.logging import configure_logging, get_logger

logger = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a trained waste YOLO detector")
    parser.add_argument("--weights", required=True, help="Path to trained .pt weights")
    parser.add_argument("--data", default="datasets/waste.yaml")
    parser.add_argument("--img", type=int, default=640)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.45)
    parser.add_argument("--out", default="weights/validation", help="Report output directory")
    return parser.parse_args()


def resolve_device(requested: str) -> str:
    if requested != "auto":
        return requested
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def validate(args: argparse.Namespace) -> dict:
    """Run Ultralytics validation and return the metrics dict."""
    try:
        from ultralytics import YOLO
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("ultralytics is required: pip install ultralytics") from exc

    weights = Path(args.weights)
    if not weights.exists():
        raise SystemExit(f"Weights not found: {weights}")

    model = YOLO(str(weights))
    metrics = model.val(
        data=args.data,
        imgsz=args.img,
        device=resolve_device(args.device),
        conf=args.conf,
        iou=args.iou,
        project=args.out,
        name="validation",
        exist_ok=True,
        plots=True,  # saves confusion_matrix.png + curves into the run dir
    )

    report = {
        "weights": str(weights),
        "dataset": args.data,
        "precision": float(metrics.box.mp),
        "recall": float(metrics.box.mr),
        "map50": float(metrics.box.map50),
        "map50_95": float(metrics.box.map),
        "per_class_map50": {
            name: float(value) for name, value in zip(model.names.values(), metrics.box.maps)
        },
        "confusion_matrix": str(Path(args.out) / "validation" / "confusion_matrix.png"),
    }
    out_dir = Path(args.out) / "validation"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.info(
        "Validation: precision=%.3f recall=%.3f mAP50=%.3f mAP50-95=%.3f",
        report["precision"], report["recall"], report["map50"], report["map50_95"],
    )
    return report


def main() -> None:
    configure_logging("INFO")
    validate(parse_args())


if __name__ == "__main__":
    main()
