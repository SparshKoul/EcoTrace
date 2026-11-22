# Deploying the EcoTrace AI/ML microservice on an Azure VM

This guide covers a single Ubuntu VM running the service in Docker, CPU-only.
It mirrors the memory/network constraints documented in `render.yaml` (Render
Standard = 2 GB RAM) — on Azure, budget **8 GB RAM** for comfortable startup.

## 1. Prerequisites

- Ubuntu 22.04 / 24.04 LTS VM, **>= 8 GB RAM** (e.g. `Standard_D2s_v3`), ~30 GB disk.
- **NSG inbound:** port `8000` (or `443` behind a reverse proxy).
- **NSG outbound (HTTPS):** `huggingface.co` (SigLIP 2 download), GitHub / Ultralytics
  release URLs (YOLO checkpoint fallback), and your Azure OpenAI endpoint.
- Docker and Git installed.
- The `yolo26n.pt` checkpoint from a local machine — it is **gitignored** (`*.pt`)
  and is **not** copied by the Dockerfile, so a fresh clone will not contain it.
- Secrets you will supply at runtime (never commit these):
  `INTERNAL_SERVICE_KEY`, `AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_KEY`,
  `ALLOWED_ORIGINS`.

AWS keys are **not needed** while `REKOGNITION_ENABLED=false` (the default).
Bedrock is display-only config; there is no AWS call in the default pipeline.

## 2. Install Docker

```bash
sudo apt-get update
sudo apt-get install -y docker.io git
sudo systemctl enable --now docker
docker --version
```

## 3. Get the code and the checkpoint

```bash
git clone https://github.com/SparshKoul/EcoTrace.git
cd EcoTrace
```

From your local machine, upload the checkpoint (adjust the user/host):

```bash
scp /path/to/EcoTrace/microservice/yolo26n.pt azureuser@<vm-ip>:/srv/ecotrace/models/yolo26n.pt
```

The service works from `/app` inside the container, and `YOLO_MODEL_PATH`
defaults to `yolo26n.pt` — so the file must land at `/app/yolo26n.pt` in the
container (the mount in step 5 does that).

## 4. Prepare storage (important)

The app writes original and privacy-blurred images to `/var/lib/ecotrace`.
The container runs as **uid 10001** (see the Dockerfile). A root-owned host
directory mounted there will cause writes to fail silently — the pipeline
degrades gracefully, but reports `original_stored: false`.

```bash
sudo mkdir -p /srv/ecotrace/data /srv/ecotrace/models
sudo chown -R 10001:10001 /srv/ecotrace/data
sudo chmod 644 /srv/ecotrace/models/yolo26n.pt   # uid 10001 must be able to read it
```

Originals are stored **unblurred** in `originals/` — keep this disk private and
backed up according to your privacy policy. Only processed images should ever
be published.

## 5. Supply configuration

Create `/srv/ecotrace/ecotrace.env` on the VM (mode `0600`, never in git):

```ini
ENVIRONMENT=production
LOG_LEVEL=INFO
PORT=8000
INTERNAL_SERVICE_KEY=<shared-secret-for-node-backend>
ALLOWED_ORIGINS=https://your-backend.onrender.com
AZURE_JUDGE_ENABLED=true
AZURE_FOUNDRY_ENDPOINT=https://<resource>.openai.azure.com
AZURE_FOUNDRY_KEY=<your-key>
AZURE_FOUNDRY_DEPLOYMENT=gpt-5-mini
AZURE_FOUNDRY_API_VERSION=2025-01-01-preview
YOLO_ENABLED=true
YOLO_MODEL_PATH=yolo26n.pt
YOLO_DEVICE=cpu
SIGLIP_ENABLED=true
REKOGNITION_ENABLED=false
ORIGINAL_IMAGE_DIR=/var/lib/ecotrace/originals
PROCESSED_IMAGE_DIR=/var/lib/ecotrace/processed
```

`ALLOWED_ORIGINS` empty means "allow all" (development only) — set it to your
backend's origin in production.

## 6. Build and run

Build **from the repository root** — this matches the `dockerContext` used in
`render.yaml` (`./microservice`):

```bash
docker build -f microservice/Dockerfile -t ecotrace-ai ./microservice
```

```bash
docker run -d --name ecotrace-ai --restart unless-stopped -p 8000:8000 \
  --env-file /srv/ecotrace/ecotrace.env \
  -v /srv/ecotrace/data:/var/lib/ecotrace \
  -v /srv/ecotrace/models/yolo26n.pt:/app/yolo26n.pt:ro \
  ecotrace-ai
```

## 7. Verify

```bash
curl localhost:8000/health
curl localhost:8000/health/ready
docker logs -f ecotrace-ai
```

Expected on `/health/ready`: `yolo.available: true` and `siglip.available: true`.
If either is `false`, the component's `reason` field plus `docker logs` will
explain it. The first boot can take several minutes: SigLIP 2 downloads ~1–2 GB
from HuggingFace into the container's cache, and the Dockerfile's HEALTHCHECK
allows only a 120 s start period (this does not stop plain `docker run`).

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `yolo.available: false`, reason contains "weights"/file not found | Checkpoint not mounted or unreadable | Check `docker inspect` mounts; `chmod 644` the file on the host |
| `siglip.available: false`, reason is a network/HTTPS error | No outbound access to huggingface.co | Allow outbound HTTPS, or pre-bake the HF cache into the image |
| `original_stored: false` in a verify response | Data dir owned by root | `chown -R 10001:10001 /srv/ecotrace/data` |
| Backend gets `401 unauthorized` | `INTERNAL_SERVICE_KEY` mismatch | Use the same value in both services; header is `X-Internal-Service-Key` |
| `413 file_too_large` | Upload exceeds `MAX_UPLOAD_BYTES` (8 MiB default) | Raise the limit in the env file if needed |
| Very large image / slow build | Linux PyTorch wheels may bundle CUDA deps despite the "CPU wheels" comment in `requirements.txt` | Install torch from the CPU index before `pip install -r requirements.txt` if a lean image is required |

## 9. Security notes

- `/docs`, `/openapi.json`, `/health` and `/health/ready` intentionally bypass
  the internal-key middleware. Put the service behind a reverse proxy or
  restrict those paths at the NSG if the VM is publicly reachable.
- Keep `/srv/ecotrace/ecotrace.env` at mode `0600`; never commit secrets.
- `REKOGNITION_ENABLED=false` means no AWS credentials are required. If you
  later enable it, an Azure VM has no automatic AWS IAM role — supply
  `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` via the env file.

## 10. Updating the deployment

```bash
cd EcoTrace
git pull
docker build -f microservice/Dockerfile -t ecotrace-ai ./microservice
docker rm -f ecotrace-ai
# re-run the docker run command from step 6
```
