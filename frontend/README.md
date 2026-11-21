# EcoTrace frontend

React 19 + TypeScript + Vite + Tailwind CSS client for EcoTrace.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run build` type-checks and bundles. `npm test` runs the Vitest suite.

## What is implemented

| PRD requirement | Where |
| :--- | :--- |
| FR-1.1 live camera only, snapshot + 5–10 s walking video | `src/hooks/useCamera.ts`, `src/components/capture/CapturePanel.tsx` |
| FR-1.2 GPS lock at ≤ 30 m | `src/hooks/useGps.ts`, `src/domain/captureGates.ts`, `src/components/ui/GpsBadge.tsx` |
| FR-1.3 "No dustbin within 1 km" toggle | `CapturePanel.tsx` (`missing bin` mode) |
| FR-1.4 cluster map, severity, sanitized photos, locked scorecards | `src/components/map/SiteMap.tsx`, `src/components/areas/Scorecard.tsx` |
| FR-1.5 human-in-the-loop complaint modal (copy / PDF / mailto) | `src/components/complaint/ComplaintModal.tsx` |

There is deliberately **no `<input type="file">`** in this app. Evidence can only come from a live `MediaStream`.

## Mock mode

`VITE_USE_MOCK_API=true` (the default) serves sample sites, areas, activity and a complaint draft built from verified quotes in the local reference corpus. Set it to `false` and point `VITE_API_BASE_URL` at the Fastify core API when the backend is ready. Submission then posts multipart data to `POST /api/v1/reports` and expects `202 { report_id, status: "PROCESSING" }`.

## Reference policy

`../ecotrace_refrence` was used only as a blueprint for domain rules and UX patterns. No code was imported from it. Keep rule constants in `src/config/rules.ts` in sync with the backend.
