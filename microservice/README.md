# EcoTrace AI/ML Microservice

FastAPI microservice that verifies environmental-waste reports for **EcoTrace**.
It accepts uploaded images, runs computer-vision / AWS AI analysis, and returns a
structured JSON verdict to the Node.js backend.

This service owns **no** user auth, **no** application database, and **no**
report storage — it is a stateless verification engine.

## Backend teammate quickstart (Node.js)

```bash
git checkout microservice        # branch with all AI/ML code
cd microservice
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env             # Azure key + region; Rekognition OFF by default
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then see **`docs/BACKEND_INTEGRATION.md`** for the ready-to-use TypeScript
client (`verifyWasteImage()`), health check, curl example, status codes and
expected JSON. `docs/verify_client.py` is a Python alternative.

Service URL: `http://localhost:8000` locally, `http://microservice:8000` on
Docker/k8s. Docs: `http://localhost:8000/docs`.

## Status — Phases 1–5 implemented (Azure judge, no AWS needed)

Implemented:

- FastAPI app factory with lifespan model loading, CORS, internal service auth
  middleware, request timing header
- `GET /health`, `GET /health/ready`, `GET /api/v1/models`
- `POST /api/v1/verify` (multipart: `file`, `report_id`, `report_type`,
  optional `latitude`/`longitude`)
- `POST /api/v1/detect` (YOLO-only detection)
- YOLO object-detection component (Ultralytics, CUDA→CPU fallback,
  graceful degradation when weights are unavailable)
- Upload validation pipeline: size cap, MIME allow-list, magic-byte sniffing,
  pixel-count guard, safe decode to RGB
- Pydantic request/response schemas, structured error envelopes
- Unit tests with a fake detector (no weights / AWS credentials required)

**Phase 4 implemented:** SigLIP 2 zero-shot waste classification
(`app/models/siglip_classifier.py`) — local, pretrained, free. Classifies an
image into one of the 7 waste classes by cosine similarity against text
prompts, with a "no_waste" negative prompt. Separate `embed_image()` method for
embeddings; bounded in-memory duplicate detection. Enabled by default via
`SIGLIP_ENABLED=true`; confidence is a relative softmax score, not a calibrated
probability. No trained head or accuracy is claimed.

Implemented alongside Phase 2: **waste-detector training pipeline**
(`training/train_yolo.py`, `validate_yolo.py`, `prepare_dataset.py`,
`waste_classes.py`, `datasets/waste.yaml`) — fine-tune/validate with
precision/recall/mAP50/mAP50-95 + confusion matrix.

**Phase 2:** Rekognition service (opt-in, `REKOGNITION_ENABLED=false` by default)
+ privacy blur (faces/plates) with separate private original/processed storage.
**Phase 3:** Azure AI Foundry vision judge (`gpt-5-mini`) replaces paid Bedrock —
strict Pydantic JSON validation, bounded retries, no fabricated confidence.
**Phase 5:** Decision engine uses all model evidence — judge YES with no YOLO
boxes is NEVER rejected as "no waste evidence"; moderation kept separate.

Planned (Phase 6):

- **Phase 2** — Amazon Rekognition (moderation, labels, faces, text) + privacy
  blurring pipeline (faces & license plates) with separate original/processed storage
- **Phase 3** — Amazon Bedrock vision judgement (Nova Lite, validated Pydantic
  responses, bounded retries)
- **Phase 4** — SigLIP 2 embeddings, classification, duplicate detection
- **Phase 5** — ML decision engine (rule-based aggregation; logistic-regression
  stacker when labelled data exists)
- **Phase 6** — batch endpoint, concurrency limits, Docker, docs

## Architecture

```
Node.js backend ──HTTP──▶ FastAPI (/api/v1/verify)
                            │
                            ├── image validation (size/MIME/signature/pixels)
                            ├── privacy pass (Phase 2: blur faces/plates)
                            ├── YOLO detector ─────────┐
                            ├── Rekognition ────────────┤ parallel,
                            ├── SigLIP 2 ───────────────┤ bounded
                            ├── Bedrock vision ─────────┘ concurrency
                            └── decision engine ─▶ {status, confidence, reasons}
```

## Directory structure

```
microservice/
├── app/
│   ├── main.py                 # app factory, lifespan, middleware, routers
│   ├── routes/                  # health, models, verify
│   ├── models/                  # yolo_detector (+ siglip_classifier, ensemble later)
│   ├── services/                # verification_service, image_processing
│   │                            # (+ rekognition, bedrock, privacy later)
│   ├── schemas/                 # Pydantic request/response models
│   ├── core/                    # config, logging (redaction), model_loader
│   └── utils/                   # image_utils (validation/decode)
├── weights/                     # local checkpoints (git-ignored)
├── datasets/                     # waste datasets (git-ignored bulk)
├── training/                     # train_yolo.py, ... (later phases)
├── tests/                        # pytest suite (mocked, no AWS needed)
├── requirements.txt
├── pytest.ini
├── .env.example
└── .gitignore
```

## Installation

```bash
cd microservice
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

GPU (CUDA): install the matching torch build first, e.g.
`pip install torch --index-url https://download.pytorch.org/whl/cu124`, then
`pip install -r requirements.txt`.

## Environment setup

```bash
cp .env.example .env       # then edit values; never commit .env
```

## Running

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Interactive docs: http://localhost:8000/docs
```

## API (Phase 1)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/health/ready` | Per-component readiness |
| GET | `/api/v1/models` | Loaded-model inventory |
| POST | `/api/v1/verify` | Full verification (Phase 1: YOLO) |
| POST | `/api/v1/detect` | Detection only |

Example:

```bash
curl -X POST http://localhost:8000/api/v1/verify \
  -F file=@garbage.jpg \
  -F report_id=ECO-001 \
  -F report_type=garbage_dump
```

Response (actual outputs — never hardcoded example values):

```json
{
  "success": true,
  "report_id": "ECO-001",
  "status": "REVIEW_REQUIRED",
  "is_waste_detected": true,
  "waste_category": "garbage_dump",
  "detections": [
    {"label": "bottle", "class_id": 39, "confidence": 0.91, "bbox": [100, 120, 300, 400]}
  ],
  "rekognition": {"available": false},
  "siglip": {"available": false},
  "bedrock": {"available": false},
  "decision": {"result": "REVIEW_REQUIRED", "confidence": null, "reasons": ["Human verification required"]},
  "model_versions": {"detector": "yolo26n.pt", "classifier": null},
  "error": null
}
```

Error envelope (consistent for 400/413/415/422/5xx):

```json
{"success": false, "error": "mime_mismatch", "detail": "..."}
```

If `INTERNAL_SERVICE_KEY` is set, all non-health endpoints require the header
`X-Internal-Service-Key: <value>` (HTTP 401 otherwise).

## YOLO model setup

Phase 1 uses a pretrained general-purpose checkpoint (`yolo26n.pt` by default,
auto-downloaded by Ultralytics on first load). **It is not a specialised waste
detector** — it labels COCO classes (bottle, backpack, ...) and will not
recognise "garbage pile" / "overflowing bin" unless fine-tuned.

### Training the waste detector

Classes are defined in `training/waste_classes.py` and `datasets/waste.yaml`
(plastic_waste, garbage_bag, garbage_dump, overflowing_bin,
construction_waste, burning_waste, other_waste).

1. **Get a waste dataset** (public, e.g. TACO, TrashNet, or a Roboflow waste
   export) with COCO-style annotations.
2. **Convert it** to YOLO format with deterministic splits:
   ```bash
   python -m training.prepare_dataset --source taco \
       --annotations /path/to/annotations.json \
       --images /path/to/images --out datasets/waste
   ```
3. **Fine-tune** (transfer learning — never from scratch):
   ```bash
   python -m training.train_yolo --data datasets/waste.yaml \
       --base yolo26n.pt --epochs 60 --device cuda
   ```
   On this machine the venv has CPU torch; for NVIDIA GPU training first
   install CUDA torch from `https://download.pytorch.org/whl/cu124`, then
   reinstall ultralytics so torch/torchvision versions stay matched.
4. **Validate** — precision, recall, mAP50, mAP50-95, confusion matrix:
   ```bash
   python -m training.validate_yolo \
       --weights weights/waste_yolo/waste_yolo_v1/weights/best.pt
   ```
   Metrics + plots land in `weights/validation/validation/`.
5. **Deploy**: set `YOLO_MODEL_PATH=weights/waste_yolo/waste_yolo_v1/weights/best.pt`
   in `.env` and restart. No code changes needed.

**Never claim trained weights exist until you've run steps 1–4** and checked the
validation report. The service reports `detector: <path>` from real config.

If weights are missing or CUDA fails, the service degrades gracefully: the
detector reports `available: false` and verification returns
`REVIEW_REQUIRED`/`REJECTED` with an explanatory reason — never a fake verdict.

## Testing

```bash
cd microservice
pytest                # unit tests: no AWS creds, no model downloads
```

Later phases add `-m real_aws` integration tests that are opt-in only.

## Docker

See `Dockerfile` (added in Phase 6).

## Main backend integration (Node.js)

```ts
const form = new FormData();
form.append("file", new Blob([imageBytes], { type: "image/jpeg" }), "garbage.jpg");
form.append("report_id", "ECO-001");
form.append("report_type", "garbage_dump");

const res = await fetch(`${MICROSERVICE_URL}/api/v1/verify`, {
  method: "POST",
  headers: { "X-Internal-Service-Key": process.env.INTERNAL_SERVICE_KEY! },
  body: form,
  signal: AbortSignal.timeout(30_000),
});
const result = await res.json(); // VerifyResponse schema
```

Docker networking: backend reaches the service at `http://microservice:8000`
inside a shared compose network.
