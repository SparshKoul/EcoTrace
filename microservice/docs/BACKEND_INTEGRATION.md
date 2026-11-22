# EcoTrace Microservice — Node.js Backend Integration

Ready-to-use code for the Node.js/TypeScript backend to call the AI/ML
microservice and get a garbage-verification result.

## Configuration (backend `.env`)

```bash
MICROSERVICE_URL=http://localhost:8000        # local
# MICROSERVICE_URL=http://microservice:8000   # Docker compose / k8s
# MICROSERVICE_URL=https://ecotrace-ai-ml.onrender.com  # deployed (Render)
INTERNAL_SERVICE_KEY=                          # must match INTERNAL_SERVICE_KEY on the service
```

The microservice URL is **internal only** — never expose it publicly.

## Install

```bash
npm install   # no extra deps needed — uses built-in fetch (Node 18+)
```

## 1. Full client (`src/integrations/ecotraceMicroservice.ts`)

```ts
export interface VerifyResult {
  success: boolean;
  report_id: string;
  status: 'ACCEPTED' | 'REJECTED' | 'REVIEW_REQUIRED';
  is_waste_detected: boolean;
  waste_category: string | null;
  detections: Array<{ label: string; class_id: number; confidence: number; bbox: number[] }>;
  rekognition: { available: boolean; moderation_status: string | null; [k: string]: unknown };
  privacy: { faces_blurred: number; plates_blurred: number; [k: string]: unknown };
  siglip: { available: boolean; predicted_category: string | null; confidence: number | null };
  bedrock: { available: boolean; judgement: 'YES'|'NO'|'UNCERTAIN'|'UNKNOWN'|null; reason: string | null; category: string | null };
  decision: { result: string; confidence: number | null; reasons: string[] };
  model_versions: { detector: string | null; classifier: string | null; rekognition: string | null };
  error: string | null;
}

const URL = process.env.MICROSERVICE_URL ?? 'http://localhost:8000';
const KEY = process.env.INTERNAL_SERVICE_KEY ?? '';

export async function verifyWasteImage(
  image: Buffer,
  filename: string,
  reportId: string,
  reportType: string,
  lat?: number,
  lon?: number,
): Promise<VerifyResult> {
  const form = new FormData();
  form.append('file', new Blob([image], { type: 'image/jpeg' }), filename);
  form.append('report_id', reportId);
  form.append('report_type', reportType);   // garbage_dump | plastic_waste | overflowing_bin | ...
  if (lat !== undefined) form.append('latitude', String(lat));
  if (lon !== undefined) form.append('longitude', String(lon));

  const res = await fetch(`${URL}/api/v1/verify`, {
    method: 'POST',
    headers: KEY ? { 'X-Internal-Service-Key': KEY } : {},
    body: form,
    signal: AbortSignal.timeout(45_000),   // Azure judge can take ~4s; budget higher
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`verify failed (${res.status}): ${body.detail?.error ?? res.statusText}`);
  }
  return (await res.json()) as VerifyResult;
}
```

## 2. Usage in a report route

```ts
import { readFile } from 'node:fs/promises';
import { verifyWasteImage } from './integrations/ecotraceMicroservice';

const image = await readFile('/tmp/uploaded-garbage.jpg');
const result = await verifyWasteImage(image, 'garbage.jpg', 'ECO-001', 'garbage_dump');

if (result.success && result.is_waste_detected) {
  // Azure judge verdict is in result.bedrock.judgement (YES / NO)
  // Final decision is in result.decision.result
  console.log('Waste detected:', result.waste_category, '| verdict:', result.status);
  console.log('Reason:', result.decision.reasons.join('; '));
  // Save report to YOUR database here (the microservice does not store reports)
} else {
  console.log('No waste / needs review:', result.decision.reasons);
}
```

## 3. Health check (call before verify)

```ts
export async function microserviceReady(): Promise<boolean> {
  const res = await fetch(`${URL}/health/ready`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return false;
  const body = await res.json();
  return body.components?.yolo?.available === true;
}
```

## 4. curl (quick manual test)

```bash
curl -X POST http://localhost:8000/api/v1/verify \
  -F file=@/path/to/garbage.jpg \
  -F report_id=ECO-001 \
  -F report_type=garbage_dump | python3 -m json.tool
```

## Expected output for a real garbage photo

```json
{
  "success": true,
  "is_waste_detected": true,
  "bedrock": {
    "available": true,
    "judgement": "YES",
    "reason": "The image shows a large pile of mixed garbage and plastic in a landfill setting.",
    "category": "a_waste_dump",
    "model": "gpt-5-mini"
  },
  "siglip": { "available": true, "predicted_category": "construction_waste", "confidence": 0.205 },
  "decision": {
    "result": "REVIEW_REQUIRED",
    "reasons": ["Vision judge reports waste evidence (a_waste_dump).", "..."]
  }
}
```

## Error handling (HTTP status codes)

| Code | Meaning | Client action |
|---|---|---|
| 200 | Verification completed (even if no waste) | Read `decision` |
| 400 | Empty/invalid image | Ask user to re-upload |
| 413 | File too large (> 8 MiB) | Compress image |
| 415 | Unsupported MIME / signature mismatch | Re-encode as JPEG |
| 422 | Missing `report_id` / bad `report_type` | Fix request fields |
| 401 | Bad internal service key | Fix `INTERNAL_SERVICE_KEY` |
| 5xx | Service failure | Retry later / log |

## Notes
- The microservice owns **no** database, users, or auth — it only verifies images.
- Face/plate images are blurred; originals stay private in the microservice's storage.
- Rekognition/Bedrock blocks show `available: false` — that's expected and fine.
