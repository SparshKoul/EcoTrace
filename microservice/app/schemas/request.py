"""Pydantic request schemas for the AI/ML microservice."""

from enum import Enum


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


__all__ = ["ReportType"]
