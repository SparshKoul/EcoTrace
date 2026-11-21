"""Privacy pass: blur faces & vehicle plates, store originals vs processed separately.

Invariants (spec 5, 9, 12):
* Only the **processed** (blurred) image is handed to downstream models and
  only the processed image may ever be published — originals stay private.
* Originals are preserved byte-for-byte in ``ORIGINAL_IMAGE_DIR`` (mode 0700
  dir / 0600 files); processed images go to ``PROCESSED_IMAGE_DIR``.
* Plate detection is **dedicated** — Rekognition DetectFaces does not find
  plates. Primary: DetectText line regions matching registration-plate
  patterns; future: YOLO plate weights in ``weights/``.
"""

from __future__ import annotations

import os
import re
from typing import Sequence

import cv2
import numpy as np
from PIL import Image

from app.core.config import Settings
from app.core.logging import get_logger
from app.services.rekognition_service import FaceRegion, TextRegion

logger = get_logger(__name__)

# Vehicle registration plate shapes (India-first, generically tolerant):
#   "MH 12 AB 1234" | "DL01C0123" | "00 AB 1234" (BH series)
_PLATE_RE = re.compile(
    r"^(?:"
    r"[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{0,3}[\s-]?\d{4}"  # MH 12 AB 1234
    r"|\d{2}[\s-]?[A-Z]{2}[\s-]?\d{4}"  # 00 AB 1234 (BH)
    r")$"
)

_SAFE_ID_RE = re.compile(r"[^A-Za-z0-9_-]")


class PrivacyService:
    """Blurs sensitive regions and manages the two storage areas."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    # --- plate detection ----------------------------------------------------- #
    @staticmethod
    def plate_regions(texts: Sequence[TextRegion]) -> list[TextRegion]:
        """Text regions whose content looks like a vehicle registration plate."""
        return [t for t in texts if _PLATE_RE.match(t.text.strip().upper())]

    # --- blurring ------------------------------------------------------------ #
    def blur(
        self,
        image: Image.Image,
        faces: Sequence[FaceRegion],
        texts: Sequence[TextRegion],
    ) -> tuple[Image.Image, int, int]:
        """Blur face boxes and plate-looking text boxes.

        Returns ``(processed_image, faces_blurred, plates_blurred)``.
        """
        plates = self.plate_regions(texts)
        face_boxes = [(f.x1, f.y1, f.x2, f.y2) for f in faces]
        plate_boxes = [(p.x1, p.y1, p.x2, p.y2) for p in plates]

        if not face_boxes and not plate_boxes:
            return image, 0, 0

        arr = np.array(image)
        height, width = arr.shape[:2]
        kernel = self._settings.privacy_blur_kernel
        faces_done = self._blur_boxes(arr, face_boxes, width, height, kernel)
        plates_done = self._blur_boxes(arr, plate_boxes, width, height, kernel)
        return Image.fromarray(arr), faces_done, plates_done

    @staticmethod
    def _blur_boxes(
        arr: np.ndarray,
        boxes: Sequence[tuple[int, int, int, int]],
        width: int,
        height: int,
        kernel: int,
    ) -> int:
        """Gaussian-blur each box (padded ~10% to catch box-edge leakage)."""
        done = 0
        for x1, y1, x2, y2 in boxes:
            pad_x = max(2, int(0.1 * (x2 - x1)))
            pad_y = max(2, int(0.1 * (y2 - y1)))
            nx1, ny1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
            nx2, ny2 = min(width, x2 + pad_x), min(height, y2 + pad_y)
            roi = arr[ny1:ny2, nx1:nx2]
            if roi.size == 0 or roi.shape[0] < 3 or roi.shape[1] < 3:
                continue
            # cv2 needs an odd kernel no larger than the region.
            k = min(kernel, roi.shape[0], roi.shape[1])
            if k % 2 == 0:
                k -= 1
            if k < 3:
                continue
            arr[ny1:ny2, nx1:nx2] = cv2.GaussianBlur(roi, (k, k), 0)
            done += 1
        return done

    # --- storage -------------------------------------------------------------- #
    def store(
        self, report_id: str, original_bytes: bytes, processed: Image.Image
    ) -> tuple[bool, bool]:
        """Persist original (raw) and processed images in *separate* directories.

        Returns ``(original_stored, processed_stored)``; storage failures are
        logged and reported as ``False`` — never fail verification over I/O.
        """
        safe_id = _SAFE_ID_RE.sub("_", report_id)[:80] or "unknown"
        original_ok = self._write_bytes(
            self._settings.original_image_dir, f"{safe_id}.orig", original_bytes
        )
        processed_ok = self._write_jpeg(
            self._settings.processed_image_dir, f"{safe_id}.jpg", processed
        )
        return original_ok, processed_ok

    @staticmethod
    def _write_bytes(directory: str, name: str, payload: bytes) -> bool:
        try:
            os.makedirs(directory, mode=0o700, exist_ok=True)
            path = os.path.join(directory, name)
            with open(path, "wb") as fh:
                fh.write(payload)
            os.chmod(path, 0o600)
            return True
        except OSError as exc:
            logger.warning("privacy_store_original_failed: %s", exc)
            return False

    @staticmethod
    def _write_jpeg(directory: str, name: str, image: Image.Image) -> bool:
        try:
            os.makedirs(directory, mode=0o700, exist_ok=True)
            path = os.path.join(directory, name)
            image.save(path, format="JPEG", quality=90)
            os.chmod(path, 0o600)
            return True
        except OSError as exc:
            logger.warning("privacy_store_processed_failed: %s", exc)
            return False


__all__ = ["PrivacyService"]
