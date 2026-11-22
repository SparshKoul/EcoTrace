"""POST /api/v1/verify, /api/v1/verify/batch, /api/v1/detect."""

from typing import Optional

import asyncio
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.schemas.request import ReportType
from app.schemas.response import DetectResponse, ErrorResponse, VerifyResponse
from app.services.image_processing import ImageValidationError
from app.services.verification_service import VerificationService

router = APIRouter(tags=["verify"])

# Number of images in a batch and how many are processed concurrently.
MAX_BATCH_SIZE = 8


class BatchItemResult(BaseModel):
    report_id: str
    success: bool
    result: object | None = None
    error: str | None = None


class BatchResponse(BaseModel):
    success: bool
    processed: int
    results: list[BatchItemResult] = Field(default_factory=list)


def _read_upload(file: UploadFile, settings: Settings) -> bytes:
    """Read the upload with the size cap enforced while streaming.

    Raises HTTPException 413 if the payload exceeds ``max_upload_bytes``.
    """
    limit = settings.max_upload_bytes
    chunks: list[bytes] = []
    total = 0
    # Read in bounded chunks so an oversized body never fully buffers.
    while True:
        chunk = file.file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail={
                    "success": False,
                    "error": "file_too_large",
                    "detail": f"File exceeds limit of {limit} bytes.",
                },
            )
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": "empty_file", "detail": "Uploaded file is empty."},
        )
    return b"".join(chunks)


def _map_validation_error(exc: ImageValidationError) -> HTTPException:
    return HTTPException(
        status_code=exc.status,
        detail={"success": False, "error": exc.code, "detail": str(exc)},
    )


@router.post(
    "/api/v1/verify",
    response_model=VerifyResponse,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 415: {"model": ErrorResponse}},
    summary="Verify an environmental-waste report image",
)
async def verify(
    request: Request,
    file: UploadFile = File(..., description="Image of the reported waste (JPEG/PNG/WEBP/BMP)"),
    report_id: str = Form(..., min_length=1, max_length=128),
    report_type: ReportType = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
) -> VerifyResponse:
    """Full verification pipeline (Phase 1: YOLO detector)."""
    settings: Settings = request.app.state.settings
    data = _read_upload(file, settings)
    service = VerificationService(registry=request.app.state.registry, settings=settings)
    try:
        return await service.verify(
            data,
            report_id=report_id,
            report_type=report_type,
            declared_mime=file.content_type,
            latitude=latitude,
            longitude=longitude,
        )
    except ImageValidationError as exc:
        raise _map_validation_error(exc) from exc


@router.post(
    "/api/v1/verify/batch",
    response_model=BatchResponse,
    summary="Verify multiple images with bounded concurrency",
)
async def verify_batch(
    request: Request,
    files: Annotated[list[UploadFile], File(..., description="Up to 8 images")],
    report_ids: Annotated[list[str], Form(..., description="One report_id per file")],
    report_types: Annotated[list[str], Form(..., description="One report_type per file")],
) -> BatchResponse:
    """Process several reports concurrently. Each item has its own result/error."""
    settings: Settings = request.app.state.settings
    if len(files) != len(report_ids) or len(files) != len(report_types):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"success": False, "error": "batch_length_mismatch"},
        )
    if not files or len(files) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"success": False, "error": "batch_size_invalid"},
        )

    service = VerificationService(registry=request.app.state.registry, settings=settings)
    semaphore = asyncio.Semaphore(settings.verify_concurrency_limit)

    async def one(file: UploadFile, report_id: str, report_type: str) -> BatchItemResult:
        async with semaphore:
            try:
                from app.schemas.request import ReportType

                data = _read_upload(file, settings)
                result = await service.verify(
                    data,
                    report_id=report_id,
                    report_type=ReportType(report_type),
                    declared_mime=file.content_type,
                )
                return BatchItemResult(report_id=report_id, success=True, result=result)
            except (HTTPException, ValueError) as exc:
                detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
                return BatchItemResult(report_id=report_id, success=False, error=str(detail)[:200])

    outcomes = await asyncio.gather(
        *(one(f, rid, rt) for f, rid, rt in zip(files, report_ids, report_types))
    )
    return BatchResponse(success=True, processed=len(outcomes), results=list(outcomes))


@router.post(
    "/api/v1/detect",
    response_model=DetectResponse,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 415: {"model": ErrorResponse}},
    summary="Run object detection only",
)
async def detect(
    request: Request,
    file: UploadFile = File(..., description="Image to run the detector on"),
    report_id: str = Form(..., min_length=1, max_length=128),
    conf: Optional[float] = Form(None, ge=0.0, le=1.0),
    iou: Optional[float] = Form(None, ge=0.0, le=1.0),
) -> DetectResponse:
    """YOLO-only detection endpoint (no decision engine)."""
    settings: Settings = request.app.state.settings
    data = _read_upload(file, settings)
    service = VerificationService(registry=request.app.state.registry, settings=settings)
    try:
        return await service.detect(
            data,
            report_id=report_id,
            declared_mime=file.content_type,
            conf=conf,
            iou=iou,
        )
    except ImageValidationError as exc:
        raise _map_validation_error(exc) from exc


__all__ = ["router"]
