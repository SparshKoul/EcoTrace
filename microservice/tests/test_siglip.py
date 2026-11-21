"""SigLIP 2 zero-shot classifier tests (fake model — no download needed)."""

from __future__ import annotations

import pytest

from app.models.siglip_classifier import SiglipClassifier
from training.waste_classes import NAMES
from tests.conftest import FakeSiglip, make_test_image


def test_class_names_are_prompted() -> None:
    from app.models.siglip_classifier import _CLASS_PROMPTS

    assert set(_CLASS_PROMPTS) == set(NAMES)
    assert "negative" not in str(_CLASS_PROMPTS).lower()


def test_classifier_unavailable_returns_structured_error() -> None:
    clf = SiglipClassifier("unused", device="cpu")
    category, confidence, error = clf.classify(__import__("PIL.Image", fromlist=["new"]).new("RGB", (10, 10)))
    assert category is None and confidence is None
    assert error is not None


def test_fake_siglip_reports_prediction() -> None:
    fake = FakeSiglip(category="garbage_dump", confidence=0.91)
    assert fake.is_loaded
    category, confidence, error = fake.classify(None)
    assert (category, confidence, error) == ("garbage_dump", 0.91, None)


def test_fake_siglip_can_be_unavailable() -> None:
    fake = FakeSiglip(available=False, error="weights_missing")
    category, confidence, error = fake.classify(None)
    assert (category, confidence, error) == (None, None, "weights_missing")


def test_summary_reports_model_id() -> None:
    fake = FakeSiglip()
    summary = SiglipClassifier("real-model-id").summary()
    assert summary.available is False
    assert summary.model_id == "real-model-id"
    assert fake.is_loaded  # fake itself is fine
