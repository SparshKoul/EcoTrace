"""Amazon Rekognition service tests — mocked boto3 client, no AWS credentials."""

from __future__ import annotations

from typing import Any

import pytest
from botocore.exceptions import ClientError, ConnectTimeoutError

from app.core.config import Settings
from app.services.rekognition_service import (
    RekognitionService,
    classify_error,
)


class StubClient:
    """Minimal boto3-shaped client returning canned responses / exceptions."""

    def __init__(self, **responses: Any) -> None:
        self._responses = responses
        self.calls: list[str] = []

    def _result(self, op: str) -> Any:
        self.calls.append(op)
        value = self._responses.get(op)
        if isinstance(value, Exception):
            raise value
        return value or {}

    def detect_moderation_labels(self, **kwargs: Any) -> Any:
        return self._result("moderation")

    def detect_faces(self, **kwargs: Any) -> Any:
        return self._result("faces")

    def detect_text(self, **kwargs: Any) -> Any:
        return self._result("text")

    def detect_labels(self, **kwargs: Any) -> Any:
        return self._result("labels")


@pytest.fixture()
def settings() -> Settings:
    return Settings(_env_file=None, aws_region="ap-south-1", aws_rekognition_min_confidence=0.55)


def service(client: StubClient, settings: Settings) -> RekognitionService:
    return RekognitionService(client, settings)


# --- Moderation ----------------------------------------------------------- #

def test_moderation_safe_when_no_labels(settings: Settings) -> None:
    result = service(StubClient(), settings).detect_moderation(b"jpeg")
    assert result.status == "safe"
    assert result.labels == ()
    assert result.error is None


def test_moderation_flagged_with_labels(settings: Settings) -> None:
    client = StubClient(
        moderation={
            "ModerationLabels": [
                {"Name": "Violence", "Confidence": 92.5, "ParentName": "Violence and Graphic Content"}
            ]
        }
    )
    result = service(client, settings).detect_moderation(b"jpeg")
    assert result.status == "flagged"
    assert result.labels[0].name == "Violence"
    assert result.labels[0].confidence == pytest.approx(0.925)
    assert result.labels[0].parent == "Violence and Graphic Content"


def test_moderation_throttling_is_classified_not_raised(settings: Settings) -> None:
    error = ClientError({"Error": {"Code": "ThrottlingException", "Message": "slow down"}}, "DetectModerationLabels")
    result = service(StubClient(moderation=error), settings).detect_moderation(b"jpeg")
    assert result.status == "unavailable"
    assert result.error == "throttled"


def test_moderation_access_denied_is_classified(settings: Settings) -> None:
    error = ClientError({"Error": {"Code": "AccessDeniedException", "Message": "no"}}, "DetectModerationLabels")
    result = service(StubClient(moderation=error), settings).detect_moderation(b"jpeg")
    assert result.error == "access_denied"


def test_label_call_failure_degrades_gracefully(settings: Settings) -> None:
    error = ClientError({"Error": {"Code": "ThrottlingException", "Message": "slow"}}, "DetectLabels")
    result = service(StubClient(labels=error), settings).detect_labels(b"jpeg")
    assert result.labels == ()
    assert result.error == "throttled"


# --- Faces ---------------------------------------------------------------- #

def test_faces_relative_boxes_convert_to_pixels(settings: Settings) -> None:
    client = StubClient(
        faces={
            "FaceDetails": [
                {"BoundingBox": {"Left": 0.1, "Top": 0.2, "Width": 0.3, "Height": 0.5}, "Confidence": 99.0}
            ]
        }
    )
    result = service(client, settings).detect_faces(b"jpeg", (200, 100))
    assert len(result.faces) == 1
    box = result.faces[0]
    assert (box.x1, box.y1, box.x2, box.y2) == (20, 20, 80, 70)
    assert box.confidence == pytest.approx(0.99)


def test_faces_timeout_is_classified(settings: Settings) -> None:
    result = service(
        StubClient(faces=ConnectTimeoutError(endpoint_url="https://rekognition.ap-south-1.amazonaws.com")),
        settings,
    ).detect_faces(b"jpeg", (100, 100))
    assert result.error == "timeout"
    assert result.faces == ()


# --- Text / plates -------------------------------------------------------- #

def test_text_uses_line_items_and_converts_geometry(settings: Settings) -> None:
    client = StubClient(
        text={
            "TextDetections": [
                {
                    "DetectedText": "MH 12 AB 1234",
                    "Type": "LINE",
                    "Confidence": 95,
                    "Geometry": {"BoundingBox": {"Left": 0.5, "Top": 0.5, "Width": 0.4, "Height": 0.1}},
                },
                {
                    "DetectedText": "MH",
                    "Type": "WORD",
                    "Confidence": 90,
                    "Geometry": {"BoundingBox": {"Left": 0.5, "Top": 0.5, "Width": 0.1, "Height": 0.1}},
                },
            ]
        }
    )
    result = service(client, settings).detect_text(b"jpeg", (200, 200))
    assert len(result.items) == 1
    item = result.items[0]
    assert item.text == "MH 12 AB 1234"
    assert (item.x1, item.y1, item.x2, item.y2) == (100, 100, 180, 120)


# --- Labels --------------------------------------------------------------- #

def test_labels_confidence_normalised_and_version_kept(settings: Settings) -> None:
    client = StubClient(
        labels={
            "Labels": [{"Name": "Garbage", "Confidence": 88.1}],
            "LabelModelVersion": "3.0",
        }
    )
    result = service(client, settings).detect_labels(b"jpeg")
    assert result.labels[0].confidence == pytest.approx(0.881)
    assert result.model_version == "3.0"


# --- Error classifier ----------------------------------------------------- #

def test_error_classifier_throttling_and_access() -> None:
    throttle = ClientError({"Error": {"Code": "RequestLimitExceeded"}}, "Op")
    denied = ClientError({"Error": {"Code": "UnrecognizedClientException"}}, "Op")
    assert classify_error(throttle) == "throttled"
    assert classify_error(denied) == "access_denied"
