"""Minimal Python client for the EcoTrace AI/ML microservice.

Usage:
    pip install httpx
    python docs/verify_client.py /path/to/garbage.jpg ECO-001 garbage_dump
"""

from __future__ import annotations

import sys
from pathlib import Path

import httpx

URL = "http://localhost:8000"
KEY = ""  # set if INTERNAL_SERVICE_KEY is configured in the microservice .env


def verify(image_path: str | Path, report_id: str, report_type: str) -> dict:
    path = Path(image_path)
    headers = {"X-Internal-Service-Key": KEY} if KEY else {}
    with httpx.Client(timeout=45.0) as client:
        response = client.post(
            f"{URL}/api/v1/verify",
            headers=headers,
            files={"file": (path.name, path.read_bytes(), "image/jpeg")},
            data={"report_id": report_id, "report_type": report_type},
        )
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 3:
        raise SystemExit("Usage: verify_client.py <image> <report_id> <report_type>")
    result = verify(*args[:3])
    print(f"success: {result['success']}")
    print(f"is_waste_detected: {result['is_waste_detected']}")
    print(f"judge: {result['bedrock']['judgement']} | {result['bedrock']['reason']}")
    print(f"decision: {result['decision']['result']} | {result['decision']['reasons']}")
