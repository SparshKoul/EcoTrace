"""
EcoTrace AI/ML microservice — photo and video privacy pipeline.

Gemini supplies typed PII boxes + waste classification in one structured JSON call.
OpenCV applies irreversible Gaussian blur over those boxes, for photos and for
sampled video keyframes with nearest-sample interpolation across frames.

Raw media stays in backend/storage/private; sanitized output goes to backend/storage/public.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv()

TrashCategory = Literal[
    "wet_organic",
    "dry_plastic_paper",
    "sanitary_biomedical",
    "special_care_ewaste_hazardous",
    "construction_debris",
    "mixed_municipal",
    "none",
]
PiiLabel = Literal["face", "license_plate", "sensitive_text"]


class BoundingBox(BaseModel):
    ymin: int = Field(ge=0, le=1000)
    xmin: int = Field(ge=0, le=1000)
    ymax: int = Field(ge=0, le=1000)
    xmax: int = Field(ge=0, le=1000)


class PiiDetection(BaseModel):
    label: PiiLabel
    box: BoundingBox


class AnalysisResult(BaseModel):
    is_valid_trash: bool
    rejection_reason: str | None = None
    trash_category: TrashCategory
    pii_detections: list[PiiDetection] = Field(default_factory=list)
    detected_items: list[str] = Field(default_factory=list)
    severity_score: int = Field(ge=1, le=5)
    public_audit_summary: str = Field(max_length=240)


PRIVATE_DIR = Path(os.getenv("BACKEND_STORAGE_PRIVATE_DIR", "../backend/storage/private")).resolve()
PUBLIC_DIR = Path(os.getenv("BACKEND_STORAGE_PUBLIC_DIR", "../backend/storage/public")).resolve()
MAX_BYTES = int(os.getenv("MAX_IMAGE_SIZE_MB", "12")) * 1024 * 1024
USE_MOCK_AI = os.getenv("USE_MOCK_AI", "false").lower() == "true"
API_KEY = os.getenv("GEMINI_API_KEY", "")

MODELS = [
    m.strip()
    for m in [
        os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
        os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite"),
        *os.getenv("GEMINI_EXTRA_MODELS", "gemini-2.5-flash,gemini-2.0-flash").split(","),
    ]
    if m.strip()
]

PROMPT = """You are a civic waste auditor. Analyse the supplied image/frame and return ONLY the JSON described by the schema.

Rules:
1. is_valid_trash is true ONLY for real outdoor waste, garbage, dumping, overflowing bins, litter, or debris. Reject selfies, indoor shots, blank walls, clean streets, screenshots, and people-only photos. When rejecting, give a short rejection_reason and set trash_category to "none".
2. Detect EVERY sensitive region visible anywhere, foreground or background: human faces, vehicle license/number plates, and visible phone numbers or personal ID text. Return each as {label, box}. Labels: face | license_plate | sensitive_text. Box coordinates are integers 0-1000 in the order [ymin, xmin, ymax, xmax].
3. trash_category must be exactly one of: wet_organic, dry_plastic_paper, sanitary_biomedical, special_care_ewaste_hazardous, construction_debris, mixed_municipal, none.
4. detected_items is a short list of concrete visible objects. Never include personal names, plate numbers, or phone numbers.
5. severity_score is 1-5 based on volume, hazard, and obstruction.
6. public_audit_summary is exactly ONE objective sentence, at most 20 words, with zero personal information.
"""

app = FastAPI(title="EcoTrace AI Service", version="2.0.0")


@app.on_event("startup")
def ensure_dirs() -> None:
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "models": MODELS, "mock_ai": USE_MOCK_AI, "public_dir": str(PUBLIC_DIR)}


def analyse_with_gemini(image_bytes: bytes, mime_type: str) -> tuple[AnalysisResult, str]:
    if USE_MOCK_AI:
        return (
            AnalysisResult(
                is_valid_trash=True,
                rejection_reason=None,
                trash_category="mixed_municipal",
                pii_detections=[],
                detected_items=["mixed municipal waste"],
                severity_score=3,
                public_audit_summary="A mixed municipal waste accumulation is visible at the reported outdoor location.",
            ),
            "mock",
        )

    if not API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    client = genai.Client(api_key=API_KEY)
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=AnalysisResult,
        temperature=0,
    )
    errors: list[str] = []
    for model in MODELS:
        try:
            response = client.models.generate_content(model=model, contents=[PROMPT, image_part], config=config)
            return AnalysisResult.model_validate(json.loads(response.text or "{}")), model
        except Exception as exc:
            errors.append(f"{model}: {type(exc).__name__}: {exc}")
    raise RuntimeError("All Gemini models failed. " + " | ".join(errors[:3]))


def _pad_box(box: BoundingBox, width: int, height: int) -> tuple[int, int, int, int]:
    x1, y1 = int(box.xmin / 1000 * width), int(box.ymin / 1000 * height)
    x2, y2 = int(box.xmax / 1000 * width), int(box.ymax / 1000 * height)
    pad_x, pad_y = max(1, int((x2 - x1) * 0.12)), max(1, int((y2 - y1) * 0.12))
    return max(0, x1 - pad_x), max(0, y1 - pad_y), min(width, x2 + pad_x), min(height, y2 + pad_y)


def blur_frame(frame: np.ndarray, detections: list[PiiDetection]) -> tuple[np.ndarray, int]:
    height, width = frame.shape[:2]
    blurred = 0
    for detection in detections:
        x1, y1, x2, y2 = _pad_box(detection.box, width, height)
        if x2 <= x1 or y2 <= y1:
            continue
        frame[y1:y2, x1:x2] = cv2.GaussianBlur(frame[y1:y2, x1:x2], (99, 99), 35)
        blurred += 1
    return frame, blurred


def _encode_jpeg(frame: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    if not ok:
        raise ValueError("Could not encode frame")
    return encoded.tobytes()


def _process_photo(report_id: str, image_bytes: bytes, mime: str) -> dict[str, object]:
    array = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="invalid_image")

    analysis, model_used = analyse_with_gemini(image_bytes, mime)
    if not analysis.is_valid_trash:
        return {
            "report_id": report_id,
            "is_valid_trash": False,
            "rejection_reason": analysis.rejection_reason or "Not a valid outdoor waste report.",
            "model_used": model_used,
        }

    clean, count = blur_frame(frame, analysis.pii_detections)
    clean_path = PUBLIC_DIR / f"{report_id}_clean.jpg"
    cv2.imwrite(str(clean_path), clean, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    return {
        "report_id": report_id,
        "is_valid_trash": True,
        "rejection_reason": None,
        "trash_category": analysis.trash_category,
        "pii_detections": [d.model_dump() for d in analysis.pii_detections],
        "detected_items": analysis.detected_items,
        "severity_score": analysis.severity_score,
        "public_audit_summary": analysis.public_audit_summary,
        "sanitized_url": f"/public/{clean_path.name}",
        "thumbnail_url": f"/public/{clean_path.name}",
        "pii_blur_count": count,
        "model_used": model_used,
    }


def _sharpness(frame: np.ndarray) -> float:
    return float(cv2.Laplacian(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())


def _process_video(report_id: str, video_bytes: bytes) -> dict[str, object]:
    temp = PRIVATE_DIR / f"{report_id}_source.webm"
    temp.write_bytes(video_bytes)
    capture = cv2.VideoCapture(str(temp))
    if not capture.isOpened():
        temp.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="invalid_video")

    fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    samples = sorted(set(np.linspace(0, total - 1, min(3, total)).astype(int).tolist()))

    sharpest: tuple[float, bytes, int] | None = None
    sampled_boxes: dict[int, list[PiiDetection]] = {}
    analysis: AnalysisResult | None = None
    model_used = "mock" if USE_MOCK_AI else ""

    for index in samples:
        capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = capture.read()
        if not ok:
            continue
        encoded = _encode_jpeg(frame)
        result, used = analyse_with_gemini(encoded, "image/jpeg")
        model_used = used
        sampled_boxes[index] = result.pii_detections
        score = _sharpness(frame)
        if sharpest is None or score > sharpest[0]:
            sharpest = (score, encoded, index)
            analysis = result

    capture.release()
    temp.unlink(missing_ok=True)

    if sharpest is None or analysis is None:
        raise HTTPException(status_code=400, detail="no_readable_frames")
    if not analysis.is_valid_trash:
        return {
            "report_id": report_id,
            "is_valid_trash": False,
            "rejection_reason": analysis.rejection_reason or "Not a valid outdoor waste report.",
            "model_used": model_used,
        }

    clean_video = PUBLIC_DIR / f"{report_id}_clean.mp4"
    thumb = PUBLIC_DIR / f"{report_id}_thumb.jpg"
    writer = cv2.VideoWriter(str(clean_video), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        raise HTTPException(status_code=500, detail="video_writer_failed")

    # Re-open the original bytes to write the sanitized frames.
    temp.write_bytes(video_bytes)
    capture = cv2.VideoCapture(str(temp))
    total_blurred = 0
    frame_index = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        nearest = min(sampled_boxes, key=lambda s: abs(s - frame_index)) if sampled_boxes else frame_index
        frame, count = blur_frame(frame, sampled_boxes.get(nearest, []))
        total_blurred += count
        if frame_index == sharpest[2]:
            cv2.imwrite(str(thumb), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        writer.write(frame)
        frame_index += 1
    capture.release()
    writer.release()
    temp.unlink(missing_ok=True)

    return {
        "report_id": report_id,
        "is_valid_trash": True,
        "rejection_reason": None,
        "trash_category": analysis.trash_category,
        "pii_detections": [d.model_dump() for d in analysis.pii_detections],
        "detected_items": analysis.detected_items,
        "severity_score": analysis.severity_score,
        "public_audit_summary": analysis.public_audit_summary,
        "sanitized_url": f"/public/{clean_video.name}",
        "thumbnail_url": f"/public/{thumb.name}",
        "pii_blur_count": total_blurred,
        "model_used": model_used,
    }


@app.post("/internal/process-media")
async def process_media(
    report_id: str = Form(...),
    media_type: str = Form("photo"),
    file: UploadFile = File(...),
) -> dict[str, object]:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", report_id):
        raise HTTPException(status_code=400, detail="invalid_report_id")
    payload = await file.read()
    if not payload or len(payload) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="invalid_or_too_large_media")
    if media_type == "video":
        return _process_video(report_id, payload)
    if media_type == "photo":
        return _process_photo(report_id, payload, file.content_type or "image/jpeg")
    raise HTTPException(status_code=400, detail="unsupported_media_type")


@app.post("/internal/analyze")
async def analyse_alias(
    report_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, object]:
    """Backwards-compatible photo-only alias used by the existing backend route."""
    return await process_media(report_id=report_id, media_type="photo", file=file)
