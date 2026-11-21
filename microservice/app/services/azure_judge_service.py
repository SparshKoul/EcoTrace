"""Azure AI Foundry / Azure OpenAI vision judge.

Sends the privacy-processed image to a vision-capable deployment and parses a
**strict JSON** answer with Pydantic. Never trusts free-form output: invalid or
unparseable answers become ``UNKNOWN`` with an error, never a fabricated
verdict or confidence score. Bounded retries + timeouts; no credentials in code.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class JudgeAnswer(BaseModel):
    """Validated structured answer from the vision model."""

    model_config = ConfigDict(extra="forbid")

    is_waste: bool
    category: str = Field(..., min_length=1, max_length=64)
    reason: str = Field(..., min_length=1, max_length=400)

    @field_validator("category")
    @classmethod
    def _normalise_category(cls, value: str) -> str:
        return value.strip().lower().replace(" ", "_")


class JudgeResult(BaseModel):
    """Judge output for the verification response."""

    available: bool = False
    judgement: str = "UNKNOWN"  # YES | NO | UNCERTAIN | UNKNOWN
    reason: Optional[str] = None
    category: Optional[str] = None
    model: Optional[str] = None
    error: Optional[str] = None
    latency_ms: Optional[int] = None


_SYSTEM_PROMPT = (
    "You are an environmental waste image analyst. Examine the image and reply "
    "with JSON only. Decide if the image shows garbage, litter, a waste dump, "
    "plastic waste, an overflowing bin, construction debris or burning waste. "
    'Format: {"is_waste": true/false, "category": "<category_or_no_waste>", '
    '"reason": "<one short sentence>"}. If the image is a drawing, synthetic, '
    "or too unclear to tell, set is_waste to false and explain in reason."
)


class AzureFoundryJudge:
    """Vision judge via Azure OpenAI chat-completions (Foundry endpoint/key)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base = self._resource_base(settings.azure_foundry_endpoint)

    @staticmethod
    def _resource_base(endpoint: str) -> str:
        """Accept both a resource base URL and a Foundry project URL."""
        endpoint = endpoint.rstrip("/")
        if "/api/projects/" in endpoint:
            # https://<resource>.services.ai.azure.com/api/projects/<proj>/openai/v1
            return endpoint.split("/api/projects/")[0].replace(
                ".services.ai.azure.com", ".openai.azure.com"
            )
        return endpoint

    @property
    def available(self) -> bool:
        return bool(self._settings.azure_judge_enabled and self._settings.azure_foundry_key)

    def judge(self, image_bytes: bytes) -> JudgeResult:
        """Run the vision judge; returns structured output, never raises."""
        if not self.available:
            return JudgeResult(available=False, error="not_configured")
        url = (
            f"{self._base}/openai/deployments/{self._settings.azure_foundry_deployment}"
            f"/chat/completions?api-version={self._settings.azure_foundry_api_version}"
        )
        b64 = encode_jpeg_bytes(image_bytes)
        payload = {
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Analyse this image. Reply with JSON only."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    ],
                },
            ],
            "max_completion_tokens": self._settings.azure_judge_max_completion_tokens,
        }
        # GPT-5 reasoning deployments accept reasoning_effort; others may not.
        if "gpt-5" in self._settings.azure_foundry_deployment:
            payload["reasoning_effort"] = self._settings.azure_judge_reasoning_effort

        import time

        started = time.monotonic()
        for attempt in range(1, 3):  # bounded retries: 2 total
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode(),
                    headers={
                        "api-key": self._settings.azure_foundry_key,
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=self._settings.azure_judge_timeout_seconds) as resp:
                    body = json.loads(resp.read())
                content = body["choices"][0]["message"].get("content") or ""
                answer = self._parse(content)
                return JudgeResult(
                    available=True,
                    judgement="YES" if answer.is_waste else "NO",
                    reason=answer.reason,
                    category=None if answer.category == "no_waste" else answer.category,
                    model=self._settings.azure_foundry_deployment,
                    latency_ms=int((time.monotonic() - started) * 1000),
                )
            except urllib.error.HTTPError as exc:
                code = exc.code
                if code in (429, 500, 502, 503, 504) and attempt == 1:
                    continue
                logger.warning("azure_judge_failed status=%s", code)
                return JudgeResult(available=True, error=f"http_{code}")
            except (ValidationError, ValueError, KeyError, IndexError) as exc:
                logger.warning("azure_judge_invalid_answer: %s", type(exc).__name__)
                return JudgeResult(available=True, error="invalid_answer")
            except Exception as exc:  # network / timeout
                logger.warning("azure_judge_error: %s", type(exc).__name__)
                return JudgeResult(available=True, error="request_failed")
        return JudgeResult(available=True, error="retries_exhausted")

    @staticmethod
    def _parse(content: str) -> JudgeAnswer:
        """Extract and validate JSON from model output (tolerates fenced JSON)."""
        text = content.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.lower().startswith("json"):
                text = text[4:]
        return JudgeAnswer.model_validate(json.loads(text))


def encode_jpeg_bytes(image_bytes: bytes) -> str:
    """Base64-encode already-JPEG bytes (image_utils has PIL-based helper)."""
    import base64

    return base64.b64encode(image_bytes).decode("ascii")


__all__ = ["AzureFoundryJudge", "JudgeResult", "JudgeAnswer"]
