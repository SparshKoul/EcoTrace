"""Azure Foundry vision judge tests — mocked HTTP, no credentials or network."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from app.core.config import Settings
from app.services.azure_judge_service import AzureFoundryJudge


@pytest.fixture()
def settings() -> Settings:
    return Settings(
        _env_file=None,
        azure_judge_enabled=True,
        azure_foundry_endpoint="https://test-resource.openai.azure.com",
        azure_foundry_key="test-key",
        azure_foundry_deployment="gpt-5-mini",
        azure_judge_timeout_seconds=5,
    )


def test_resource_base_accepts_project_url() -> None:
    base = AzureFoundryJudge._resource_base(
        "https://res.services.ai.azure.com/api/projects/proj/openai/v1"
    )
    assert base == "https://res.openai.azure.com"


def test_parse_valid_json() -> None:
    answer = AzureFoundryJudge._parse(
        '{"is_waste":true,"category":"Garbage Dump","reason":"Visible trash pile"}'
    )
    assert answer.is_waste is True
    assert answer.category == "garbage_dump"


def test_parse_fenced_json() -> None:
    answer = AzureFoundryJudge._parse(
        '```json\n{"is_waste":false,"category":"no_waste","reason":"clean"}\n```'
    )
    assert answer.is_waste is False


def test_parse_invalid_json_raises() -> None:
    with pytest.raises((ValueError, Exception)):
        AzureFoundryJudge._parse("this is not json")


def test_judge_returns_yes_for_waste(settings: Settings) -> None:
    judge = AzureFoundryJudge(settings)
    body = {
        "choices": [
            {
                "message": {
                    "content": '{"is_waste":true,"category":"plastic_waste","reason":"Bottles visible"}'
                }
            }
        ]
    }

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return json.dumps(body).encode()

    with patch("urllib.request.urlopen", return_value=Resp()):
        result = judge.judge(b"fake-jpeg")
    assert result.judgement == "YES"
    assert result.category == "plastic_waste"
    assert result.available is True
    assert result.error is None


def test_judge_unavailable_without_key(settings: Settings) -> None:
    judge = AzureFoundryJudge(settings.model_copy(update={"azure_foundry_key": ""}))
    result = judge.judge(b"x")
    assert result.available is False
    assert result.error == "not_configured"


def test_invalid_answer_is_reported_not_fabricated(settings: Settings) -> None:
    judge = AzureFoundryJudge(settings)
    body = {"choices": [{"message": {"content": "totally invalid"}}]}

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return json.dumps(body).encode()

    with patch("urllib.request.urlopen", return_value=Resp()):
        result = judge.judge(b"fake-jpeg")
    assert result.judgement == "UNKNOWN"
    assert result.error == "invalid_answer"
