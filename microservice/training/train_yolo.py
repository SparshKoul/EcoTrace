"""Fine-tune a YOLO26 checkpoint on the EcoTrace waste dataset.

Usage (from microservice/):
    python -m training.train_yolo --data datasets/waste.yaml \
        --base yolo26n.pt --epochs 60 --img 640

No training from scratch: we start from Ultralytics' pretrained checkpoint and
fine-tune with transfer learning. Output weights land in weights/ (git-ignored).
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.core.logging import configure_logging, get_logger
from training.waste_classes import NAMES

logger = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune YOLO on waste data")
    parser.add_argument("--data", default="datasets/waste.yaml", help="YOLO dataset YAML")
    parser.add_argument("--base", default="yolo26n.pt", help="Pretrained checkpoint (transfer learning)")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--img", type=int, default=640, help="Training image size")
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default="auto", help="auto | cpu | cuda | cuda:0")
    parser.add_argument("--patience", type=int, default=15, help="Early stopping patience")
    parser.add_argument("--out", default="weights/waste_yolo", help="Output run directory")
    parser.add_argument("--name", default="waste_yolo_v1", help="Run/experiment name")
    return parser.parse_args()


def resolve_device(requested: str) -> str:
    if requested != "auto":
        return requested
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def train(args: argparse.Namespace) -> Path:
    """Run Ultralytics fine-tuning. Returns the run directory."""
    try:
        from ultralytics import YOLO
    except ImportError as exc:  # pragma: no cover - depends on env
        raise SystemExit("ultralytics is required: pip install ultralytics") from exc

    data_path = Path(args.data)
    if not data_path.exists():
        raise SystemExit(f"Dataset config not found: {data_path}. See datasets/waste.yaml.")

    device = resolve_device(args.device)
    logger.info("Fine-tuning %s on %s (device=%s, epochs=%d)", args.base, args.data, device, args.epochs)
    model = YOLO(args.base)  # pretrained weights — NOT trained from scratch
    model.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.img,
        batch=args.batch,
        device=device,
        patience=args.patience,
        project=args.out,
        name=args.name,
        exist_ok=True,
        # Augmentations appropriate for in-the-wild waste photos:
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        fliplr=0.5,
        mosaic=1.0,
    )
    run_dir = Path(args.out) / args.name
    logger.info("Training complete. Weights: %s", run_dir / "weights" / "best.pt")
    return run_dir


def main() -> None:
    configure_logging("INFO")
    args = parse_args()
    names_expected = NAMES
    logger.info("Classes (%d): %s", len(names_expected), ", ".join(names_expected))
    train(args)


if __name__ == "__main__":
    main()
