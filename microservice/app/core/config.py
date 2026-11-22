"""Application configuration loaded from environment variables."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Bounded types (pattern borrowed from JunkSnap ml/settings/base.py): a bad
# value becomes a loud startup error instead of a silent misconfiguration.
Probability = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
Seconds = Annotated[float, Field(gt=0.0, le=600.0, allow_inf_nan=False)]
MaxBytes = Annotated[int, Field(gt=0, le=1024 * 1024 * 1024)]  # <= 1 GiB hard cap


class Settings(BaseSettings):
    """Runtime settings for the EcoTrace AI/ML microservice.

    All values are sourced from environment variables (optionally via a ``.env``
    file). Secrets are never hard-coded — see ``.env.example`` for placeholders.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        # An empty env var means "unset" (keeps the .env.example defaults working).
        env_ignore_empty=True,
        frozen=True,
    )

    # --- General -----------------------------------------------------------
    app_name: str = "EcoTrace AI/ML Microservice"
    environment: Literal["development", "staging", "production"] = "development"
    log_level: str = "INFO"

    # --- Internal service authentication ----------------------------------
    # Shared secret the Node.js backend must send in ``X-Internal-Service-Key``.
    # When empty, auth is disabled (development only).
    internal_service_key: str = ""
    allowed_origins: str = ""  # comma-separated; empty = all (dev only)

    # --- Request limits / security -----------------------------------------
    max_upload_bytes: MaxBytes = 8 * 1024 * 1024  # 8 MiB default upload cap
    max_image_pixels: int = Field(default=40_000_000, gt=0)  # decompression-bomb guard
    verify_concurrency_limit: int = Field(default=4, ge=1, le=64)  # bounded AWS concurrency

    # --- YOLO detector -----------------------------------------------------
    yolo_enabled: bool = True
    yolo_model_path: str = "yolo26n.pt"  # Ultralytics pretrained checkpoint
    yolo_conf_threshold: Probability = 0.25
    yolo_iou_threshold: Probability = 0.45
    yolo_device: str = "auto"  # "auto" | "cpu" | "cuda" | "cuda:0" ...
    yolo_max_detections: int = Field(default=100, ge=1, le=1000)

    # --- Rekognition -------------------------------------------------------
    rekognition_enabled: bool = False  # paid AWS API — opt in via .env only
    # Mumbai — lowest latency from India; Rekognition & Bedrock available.
    aws_region: str = "ap-south-1"
    aws_rekognition_max_labels: int = Field(default=30, ge=1, le=200)
    aws_rekognition_min_confidence: Probability = 0.55
    # Bounded retries/timeouts so a hung AWS call fails inside the request budget.
    aws_max_attempts: int = Field(default=3, ge=1, le=10)
    aws_connect_timeout_seconds: Seconds = 3.0
    aws_read_timeout_seconds: Seconds = 10.0

    # --- Privacy ------------------------------------------------------------
    # Gaussian kernel (odd; normalised at use) for blurring faces & plates.
    privacy_blur_kernel: int = Field(default=51, ge=3, le=301)

    # --- Azure AI Foundry / OpenAI vision judge ---------------------------
    azure_judge_enabled: bool = True  # local endpoint + key from .env
    azure_foundry_endpoint: str = ""  # project URL or resource base URL
    azure_foundry_key: str = ""
    azure_foundry_deployment: str = "gpt-5-mini"
    azure_foundry_api_version: str = "2025-01-01-preview"
    azure_judge_timeout_seconds: Seconds = 45.0
    azure_judge_max_completion_tokens: int = Field(default=1500, ge=100, le=8000)
    azure_judge_reasoning_effort: str = "low"

    # --- Bedrock (kept for compatibility, disabled) -----------------------
    bedrock_enabled: bool = False
    bedrock_model_id: str = "amazon.nova-lite-v1:0"
    bedrock_max_tokens: int = Field(default=512, ge=1, le=8192)
    bedrock_temperature: float = Field(default=0.0, ge=0.0, le=1.0)
    bedrock_timeout_seconds: Seconds = 15.0
    bedrock_max_retries: int = Field(default=3, ge=1, le=10)

    # --- SigLIP 2 ----------------------------------------------------------
    siglip_enabled: bool = True  # local, free, pretrained — zero-shot classification
    siglip_model_id: str = "google/siglip2-base-patch16-224"
    siglip_embedding_device: str = "auto"
    siglip_similarity_threshold: Probability = 0.85  # duplicate-image cosine threshold

    # --- Storage -----------------------------------------------------------
    # Original uploads are kept private; processed (privacy-blurred) images
    # are written separately. Never publish unblurred originals.
    original_image_dir: str = "/var/lib/ecotrace/originals"
    processed_image_dir: str = "/var/lib/ecotrace/processed"

    @property
    def yolo_device_resolved(self) -> str:
        """Resolve ``auto`` to CUDA when available, otherwise CPU."""
        if self.yolo_device != "auto":
            return self.yolo_device
        try:
            import torch

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

    @property
    def auth_enabled(self) -> bool:
        return bool(self.internal_service_key)


@lru_cache
def get_settings() -> Settings:
    """Return a cached application-wide :class:`Settings` instance."""
    return Settings()


# Re-exported for convenient imports across the package.
__all__ = ["Settings", "get_settings"]
