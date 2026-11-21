"""Central logging configuration.

Formats log records consistently and redacts sensitive material so AWS
credentials or secrets never reach log sinks.
"""

import logging
import re
import sys
from typing import Optional

# Patterns that could leak secrets into logs.
_REDACT_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?i)aws_secret_access_key\s*[=:]\s*\S+"), "aws_secret_access_key=[REDACTED]"),
    (re.compile(r"(?i)aws_access_key_id\s*[=:]\s*\S+"), "aws_access_key_id=[REDACTED]"),
    (re.compile(r"(?i)(authorization\s*[=:]\s*)(\S+)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(x-internal-service-key\s*[=:]\s*)(\S+)"), r"\1[REDACTED]"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "[REDACTED]"),
)


class RedactingFilter(logging.Filter):
    """Scrub obvious credential material from every emitted record."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D102
        try:
            message = record.getMessage()
        except Exception:  # pragma: no cover - defensive
            return True
        redacted = message
        for pattern, replacement in _REDACT_PATTERNS:
            redacted = pattern.sub(replacement, redacted)
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True


def configure_logging(level: str = "INFO") -> None:
    """Configure root logging with a consistent, redacting format."""
    root = logging.getLogger()
    root.setLevel(level.upper())

    # Avoid duplicate handlers when called more than once (e.g. in tests).
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        handler = logging.StreamHandler(stream=sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        handler.addFilter(RedactingFilter())
        root.addHandler(handler)

    # Quiet noisy third-party loggers.
    for noisy in ("botocore", "boto3", "urllib3", "PIL"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """Return a namespaced logger."""
    return logging.getLogger(name or "ecotrace")


__all__ = ["configure_logging", "get_logger", "RedactingFilter"]
