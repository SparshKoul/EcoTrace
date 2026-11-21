"""
EcoTrace AI/ML microservice.

One Gemini structured-JSON call detects PII boxes, verifies that the photo is real
outdoor waste, classifies the waste stream, and produces an audit summary.
OpenCV then applies irreversible Gaussian blur over every returned box before the
sanitized image is written to the backend's PUBLIC storage folder.

Raw images stay in backend/storage/private and are never served publicly.
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
    """Normalised 0-1000 integer coordinates: [ymin, xmin, ymax, xmax]."""

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
    model.strip()
    for model in [
        os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
        os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite"),
        *os.getenv("GEMINI_EXTRA_MODELS", "gemini-2.5-flash,gemini-2.0-flash").split(","),
    ]
    if model.strip()
]

PROMPT = """You are a civic waste auditor. Analyse the supplied image and return ONLY the JSON described by the schema.

Rules:
1. is_valid_trash is true ONLY for real outdoor waste, garbage, dumping, overflowing bins, litter, or debris. Reject selfies, indoor shots, blank walls, clean streets, screenshots, and people-only photos. When rejecting, give a short rejection_reason and set trash_category to "none".
2. Detect EVERY sensitive region visible anywhere in the image, foreground or background: human faces, vehicle license/number plates, and visible phone numbers or personal ID text. Return each as a bounding box with label face | license_plate | sensitive_text. Coordinates are integers on a 0-1000 scale in the order [ymin, xmin, ymax, xmax]. Do not miss small background plates or faces.
3. trash_category must be exactly one of: wet_organic, dry_plastic_paper, sanitary_biomedical, special_care_ewaste_hazardous, construction_debris, mixed_municipal, none.
4. detected_items is a short list of concrete visible objects, e.g. "plastic bags", "cardboard boxes". Never include personal names, plate numbers, or phone numbers.
5. severity_score is 1-5 based on volume, hazard, and obstruction.
6. public_audit_summary is exactly ONE objective sentence, at most 20 words, with zero personal information.
"""

app = FastAPI(title="EcoTrace AI Service", version="1.0.0")


@app.on_event("startup")
def ensure_dirs() -> None:
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "models": MODELS,
        "mock_ai": USE_MOCK_AI,
        "public_dir": str(PUBLIC_DIR),
    }


def _client() -> genai.Client:
    if not API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return genai.Client(api_key=API_KEY)


def _mock_analysis() -> AnalysisResult:
    return AnalysisResult(
        is_valid_trash=True,
        rejection_reason=None,
        trash_category="mixed_municipal",
        pii_detections=[],
        detected_items=["mixed municipal waste"],
        severity_score=3,
        public_audit_summary="A mixed municipal waste accumulation is visible at the reported outdoor location.",
    )


def analyse_with_gemini(image_bytes: bytes, mime_type: str) -> tuple[AnalysisResult, str]:
    if USE_MOCK_AI:
        return _mock_analysis(), "mock"

    client = _client()
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=AnalysisResult,
        temperature=0,
    )
    errors: list[str] = []
    for model in MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                contents=[PROMPT, image_part],
                config=config,
            )
            payload = json.loads(response.text or "{}")
            return AnalysisResult.model_validate(payload), model
        except Exception as exc:  # try the next available model
            errors.append(f"{model}: {type(exc).__name__}: {exc}")
    raise RuntimeError("All Gemini models failed. " + " | ".join(errors[:3]))


def _pad_box(box: BoundingBox, width: int, height: int) -> tuple[int, int, int, int]:
    x1 = int(box.xmin / 1000 * width)
    y1 = int(box.ymin / 1000 * height)
    x2 = int(box.xmax / 1000 * width)
    y2 = int(box.ymax / 1000 * height)
    pad_x = max(1, int((x2 - x1) * 0.12))
    pad_y = max(1, int((y2 - y1) * 0.12))
    return (
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(width, x2 + pad_x),
        min(height, y2 + pad_y),
    )


def blur_pii(image_bytes: bytes, detections: list[PiiDetection]) -> tuple[np.ndarray, int]:
    array = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("The uploaded file is not a readable image.")
    height, width = image.shape[:2]
    blurred = 0
    for detection in detections:
        x1, y1, x2, y2 = _pad_box(detection.box, width, height)
        if x2 <= x1 or y2 <= y1:
            continue
        roi = image[y1:y2, x1:x2]
        image[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (99, 99), 35)
        blurred += 1
    return image, blurred


@app.post("/internal/analyze")
async def analyse(
    report_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, object]:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", report_id):
        raise HTTPException(status_code=400, detail="invalid_report_id")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="empty_image")
    if len(image_bytes) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="image_too_large")

    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = PRIVATE_DIR / f"{report_id}.jpg"
    raw_path.write_bytes(image_bytes)

    try:
        analysis, model_used = analyse_with_gemini(image_bytes, file.content_type or "image/jpeg")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not analysis.is_valid_trash:
        raw_path.unlink(missing_ok=True)
        return {
            "report_id": report_id,
            "is_valid_trash": False,
            "rejection_reason": analysis.rejection_reason or "Not a valid outdoor waste report.",
            "model_used": model_used,
            "sanitized_path": None,
            "pii_blur_count": 0,
        }

    sanitized_image, blurred = blur_pii(image_bytes, analysis.pii_detections)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    clean_path = PUBLIC_DIR / f"{report_id}_clean.jpg"
    cv2.imwrite(str(clean_path), sanitized_image, [int(cv2.IMWRITE_JPEG_QUALITY), 90])

    return {
        "report_id": report_id,
        "is_valid_trash": True,
        "rejection_reason": None,
        "trash_category": analysis.trash_category,
        "pii_detections": [d.model_dump() for d in analysis.pii_detections],
        "detected_items": analysis.detected_items,
        "severity_score": analysis.severity_score,
        "public_audit_summary": analysis.public_audit_summary,
        "sanitized_path": str(clean_path),
        "sanitized_url": f"/public/{clean_path.name}",
        "pii_blur_count": blurred,
        "model_used": model_used,
    }
