"""Safe image validation and decoding utilities.

Defence-in-depth for uploads:
1. Size cap (enforced upstream by ASGI server/stream limits too).
2. MIME type allow-list from the client.
3. Magic-byte (file signature) sniffing — the declared MIME must match the
   actual bytes.
4. Dimension / pixel-count checks (decompression-bomb guard).
5. Safe decode via Pillow with ``ImageFile.LOAD_TRUNCATED_IMAGES`` disabled,
   always normalised to RGB.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Optional

from PIL import Image, ImageOps, UnidentifiedImageError

# Only formats we are willing to decode.
ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "WEBP", "BMP"})

ALLOWED_MIME_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/bmp"}
)

# First-bytes signatures used to confirm the real file format.
_SIGNATURES: tuple[tuple[bytes, str, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg", "JPEG"),
    (b"\x89PNG\r\n\x1a\n", "image/png", "PNG"),
    (b"RIFF", "image/webp", "WEBP"),  # verified further below (WEBP container)
    (b"BM", "image/bmp", "BMP"),
)


class ImageValidationError(ValueError):
    """Raised when an upload fails validation.

    ``code`` is a stable machine-readable identifier; ``status`` is the HTTP
    status the route layer should return.
    """

    def __init__(self, message: str, *, code: str = "invalid_image", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass(frozen=True)
class ValidatedImage:
    """An image that passed all validation and is decoded to RGB."""

    image: Image.Image
    width: int
    height: int
    fmt: str
    size_bytes: int


def _detect_signature(data: bytes) -> Optional[str]:
    """Return the format implied by the file's magic bytes, if recognisable."""
    if len(data) < 12:
        return None
    for magic, _mime, fmt in _SIGNATURES:
        if data.startswith(magic):
            if fmt == "WEBP" and data[8:12] != b"WEBP":
                return None
            return fmt
    return None


def validate_upload(
    data: bytes,
    *,
    declared_mime: Optional[str],
    max_bytes: int,
    max_pixels: int,
) -> ValidatedImage:
    """Validate and decode an uploaded image.

    Args:
        data: Raw uploaded bytes.
        declared_mime: MIME type declared by the client (multipart part).
        max_bytes: Maximum accepted file size in bytes.
        max_pixels: Maximum accepted width * height.

    Returns:
        A :class:`ValidatedImage` containing the decoded RGB image.

    Raises:
        ImageValidationError: If any validation step fails. The exception
            carries an HTTP ``status`` for the route layer.
    """
    # 1. Empty payload.
    if not data:
        raise ImageValidationError("Uploaded file is empty.", code="empty_file")

    # 2. Size cap.
    if len(data) > max_bytes:
        raise ImageValidationError(
            f"File size {len(data)} bytes exceeds limit of {max_bytes} bytes.",
            code="file_too_large",
            status=413,
        )

    # 3. Declared MIME type.
    mime = (declared_mime or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_MIME_TYPES:
        raise ImageValidationError(
            f"Unsupported MIME type '{declared_mime}'. "
            f"Allowed: {sorted(ALLOWED_MIME_TYPES)}.",
            code="unsupported_mime_type",
            status=415,
        )

    # 4. Magic-byte sniffing must agree with the declared type.
    sniffed = _detect_signature(data)
    if sniffed is None:
        raise ImageValidationError(
            "File content does not match any supported image signature.",
            code="invalid_file_signature",
            status=415,
        )
    sniffed_mime = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
        "BMP": "image/bmp",
    }[sniffed]
    if sniffed_mime != mime:
        raise ImageValidationError(
            f"Declared MIME type '{mime}' does not match file signature '{sniffed_mime}'.",
            code="mime_mismatch",
            status=415,
        )

    # 5. Decode with Pillow (bounds-checked before full decode).
    try:
        with Image.open(BytesIO(data)) as probe:
            fmt = (probe.format or "").upper()
            width, height = probe.size
            if fmt not in ALLOWED_FORMATS:
                raise ImageValidationError(
                    f"Unsupported image format '{fmt}'.",
                    code="unsupported_format",
                    status=415,
                )
            if width <= 0 or height <= 0:
                raise ImageValidationError(
                    "Image has invalid dimensions.", code="invalid_dimensions"
                )
            if width * height > max_pixels:
                raise ImageValidationError(
                    f"Image dimensions {width}x{height} exceed pixel limit {max_pixels}.",
                    code="image_too_large",
                    status=413,
                )
            # Fully materialise before the context manager closes the file.
            image = ImageOps.exif_transpose(probe).convert("RGB")
            image.load()
    except ImageValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageValidationError(
            f"Failed to decode image: {exc}", code="decode_error"
        ) from exc

    return ValidatedImage(
        image=image,
        width=image.width,
        height=image.height,
        fmt=fmt,
        size_bytes=len(data),
    )


def encode_jpeg(image: Image.Image, quality: int = 90) -> bytes:
    """Encode an RGB image to JPEG bytes."""
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


__all__ = [
    "ALLOWED_FORMATS",
    "ALLOWED_MIME_TYPES",
    "ImageValidationError",
    "ValidatedImage",
    "validate_upload",
    "encode_jpeg",
]
