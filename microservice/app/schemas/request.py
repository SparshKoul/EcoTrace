"""Pydantic request schemas for the AI/ML microservice."""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ReportType(str, Enum):
    """Categories of environmental reports the service can verify."""

    GARBAGE_DUMP = "garbage_dump"
    PLASTIC_WASTE = "plastic_waste"
    OVERFLOWING_BIN = "overflowing_bin"
    BURNING_WASTE = "burning_waste"
    CONSTRUCTION_WASTE = "construction_waste"
    WATER_POLLUTION = "water_pollution"
    LITTERING = "littering"
    OTHER = "other"


class GeoLocation(BaseModel):
    """Optional WGS84 coordinates attached to a report."""

    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class DetectRequest(BaseModel):
    """Metadata for object-detection-only requests (no full verification)."""

    report_id: str = Field(..., min_length=1, max_length=128)
    conf_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    iou_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)


__all__ = ["ReportType", "GeoLocation", "DetectRequest"]
