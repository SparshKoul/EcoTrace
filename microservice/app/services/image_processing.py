"""Image preprocessing pipeline (validation, normalisation, safe decode).

Step 1–7 of the documented pipeline:
1. Receive uploaded image
2. Validate MIME type and actual file format
3. Validate file size
4. Check image dimensions
5. Decode image safely
6. Convert to RGB
7. Run necessary preprocessing (resize / normalise helpers)

Moderation, privacy blurring and model inference live in sibling services.
"""

from __future__ import annotations

from typing import Optional

from PIL import Image

from app.core.config import Settings
from app.utils.image_utils import ImageValidationError, ValidatedImage, validate_upload

# Max side length the detector resize path targets (letterboxed by Ultralytics).
DEFAULT_TARGET_SIZE = 640


def preprocess_upload(
    data: bytes,
    declared_mime: Optional[str],
    settings: Settings,
) -> ValidatedImage:
    """Validate and decode an upload according to service limits.

    Raises:
        ImageValidationError: carrying ``code`` and ``status`` for HTTP mapping.
    """
    return validate_upload(
        data,
        declared_mime=declared_mime,
        max_bytes=settings.max_upload_bytes,
        max_pixels=settings.max_image_pixels,
    )


def prepare_for_inference(image: Image.Image, target_size: int = DEFAULT_TARGET_SIZE) -> Image.Image:
    """Return an RGB copy sized for inference if it exceeds ``target_size``.

    Ultralytics handles its own letterboxing, so this only guards against
    pathologically large inputs that would waste GPU memory. Small images are
    returned unchanged (upscaling destroys detail).
    """
    if max(image.size) <= target_size:
        return image
    image_copy = image.copy()
    image_copy.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
    return image_copy


__all__ = [
    "preprocess_upload",
    "prepare_for_inference",
    "ImageValidationError",
    "ValidatedImage",
    "DEFAULT_TARGET_SIZE",
]
