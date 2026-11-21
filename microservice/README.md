# EcoTrace AI Microservice

FastAPI service that turns a raw citizen photo into a **sanitized, classified, auditable** report.

## Which AI to use (and why)

| Job | Tool | Reason |
| :--- | :--- | :--- |
| Find faces, number plates, sensitive text; confirm it is real outdoor waste; classify the waste stream; write the audit sentence | **Google Gemini** via `google-genai` (one structured-JSON call, `response_schema`) | One call returns all boxes and classifications with strict types. No separate detection model to train or host. |
| Apply irreversible blurring | **OpenCV** `GaussianBlur(roi, (99,99), 35)` with 12% padding | Deterministic, local, fast, and guaranteed — the AI only supplies box coordinates, never the pixels. |

Alternative if you later want offline/edge inference: Ultralytics YOLOv8 for waste + plate detection, but that needs model weights, GPU/CPU tuning and a separate LLM for the letter/summary. Gemini + OpenCV is the fastest reliable path for this build.

### Models

`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` and `GEMINI_EXTRA_MODELS` are tried in order. Defaults follow the build spec (`gemini-3.8-flash` → `gemini-3.5-flash-lite`) and then known-good fallbacks (`gemini-2.5-flash`, `gemini-2.0-flash`). If your API key/region does not expose the first names, set the env vars to a model you do have — no code change needed.

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # add your free key from https://aistudio.google.com/app/apikey
python3 -m uvicorn main:app --host 127.0.0.1 --port 8100
```

Set `USE_MOCK_AI=true` in `.env` to run the full pipeline without an API key (deterministic classification, no boxes). Never enable it in production.

The service uses port **8100** because the Fastify backend currently uses 8000. Change `MICROSERVICE_PORT` and the backend's `AI_SERVICE_URL` together if you want the spec's 8000/3001 split.

## Endpoints

- `GET /health` — status, configured model chain, mock flag
- `POST /internal/analyze` — multipart fields `report_id`, `file`; returns:
  ```json
  {
    "report_id": "…",
    "is_valid_trash": true,
    "trash_category": "mixed_municipal",
    "pii_detections": [{ "label": "face", "box": { "ymin": 120, "xmin": 300, "ymax": 400, "xmax": 520 } }],
    "detected_items": ["plastic bags"],
    "severity_score": 3,
    "public_audit_summary": "A mixed municipal waste pile is visible beside the road.",
    "sanitized_path": "../backend/storage/public/<id>_clean.jpg",
    "sanitized_url": "/public/<id>_clean.jpg",
    "pii_blur_count": 1
  }
  ```
  If `is_valid_trash` is false, the backend deletes the raw file and returns HTTP 422.

## Storage contract

- Raw upload → `backend/storage/private/{report_id}.jpg` (never served)
- Sanitized output → `backend/storage/public/{report_id}_clean.jpg` (served by Fastify at `/public/...`)

Coordinates from Gemini are integers on a 0–1000 scale ordered `[ymin, xmin, ymax, xmax]`, descaled to pixels with 12% padding before blurring.

## Verify locally

```bash
curl http://127.0.0.1:8100/health
curl -X POST http://127.0.0.1:8100/internal/analyze \
  -F 'report_id=test1' -F 'file=@/path/to/photo.jpg;type=image/jpeg'
```
