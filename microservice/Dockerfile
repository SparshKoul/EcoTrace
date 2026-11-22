# EcoTrace AI/ML verification microservice — Python 3.12, CPU by default.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Layer 1: system deps for OpenCV / NumPy (headless: no GUI libs needed).
RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Layer 2: Python dependencies (requirements copied alone for cache reuse).
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Layer 3: application code.
COPY app/ ./app/
COPY training/ ./training/
COPY datasets/ ./datasets/

# Non-root user for production security.
RUN groupadd --gid 10001 ecotrace \
 && useradd --uid 10001 --gid 10001 --create-home ecotrace \
 && mkdir -p /var/lib/ecotrace/originals /var/lib/ecotrace/processed \
 && chown -R 10001:10001 /var/lib/ecotrace /app
USER 10001:10001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)" || exit 1

# Env-driven port (Render sets PORT); uvicorn reads $PORT via shell expansion.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
