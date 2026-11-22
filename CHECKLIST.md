# EcoTrace — Status & Checklist

**Last updated:** 22 Nov 2026
**Authoritative branch:** `testing` (hardening + pipeline integration work)
`frontend/`, `backend/`, `microservice/` and `testing/` all exist in the monorepo; `ecotrace_refrence/` is gitignored.

---

## ✅ Done

### Repository & tooling
- [x] Monorepo structure: `frontend/`, `backend/`, `microservice/`, `testing/`
- [x] Root `.gitignore` excludes `ecotrace_refrence/`, `.env`, `node_modules/`, `__pycache__/`
- [x] Module READMEs for `frontend/` and `backend/`
- [x] Supabase credentials stored only in gitignored `backend/.env` (never pushed)

### Backend — Phases 1–5
- [x] Phase 1: Fastify 5 server, TypeScript, CORS, Pino logging, `/health`, env validation with Zod, Postgres pool, report intake, AI verify client, boundary resolver
- [x] Phase 2: 20 m spatial clustering, administrative boundary resolution (ULB/MLA/MP), `GET /sites`, `GET /sites/:id`
- [x] Phase 3 (complete): cleanup claim pipeline, legal letter drafting, deterministic SWM 2026 quote verifier, 10-backer quorum, AI cleanup validation
- [x] Phase 4 (complete): voting, community notes, AI note summaries, My Activity, photo abuse flagging
- [x] Phase 5 (complete): area cleanliness scores, worst-first city rankings, video scan ingestion with GPS frames, social share cards (JSON + SVG)
- [x] **30 HTTP endpoints** registered under `/api`, plus `/health`

### Database (Supabase)
- [x] Supabase Postgres connected (Tokyo pooler, IPv4, TLS auto-detected)
- [x] `npm run db:migrate` / `db:check` / `db:setup` scripts
- [x] **12 tables** applied and verified live: `users`, `sites`, `reports`, `notes`, `area_scores`, `cleanup_claims`, `site_backers`, `letters`, `site_votes`, `photo_flags`, `scan_sessions`, `scan_frames`
- [x] UUID defaults via built-in `gen_random_uuid()` (no extension needed)
- [x] All Phase 3–5 writes verified to persist in Supabase with real UUIDs
- [x] `public.users` profile table linked to `auth.users`, auto-created by trigger, backfilled
- [x] Passwords hashed by Supabase Auth (bcrypt `$2a$10$…`); hash mirrored in `users.password_hash` and hidden from anon/authenticated clients via column-level REVOKE

### AI transparency pipeline (new)
- [x] `microservice/` FastAPI + OpenCV + `google-genai`: one structured Gemini call for PII boxes, trash authenticity, SWM category, audit summary
- [x] Irreversible face/plate/sensitive-text blurring via `cv2.GaussianBlur(roi, (99,99), 35)` with 12% padding
- [x] Raw → `backend/storage/private`, sanitized → `backend/storage/public` served at `/public/...`
- [x] `POST /api/v1/reports` with `trustProxy`, masked IP + SHA-256 `ip_hash`, exact `captured_at`, 422 on invalid trash
- [x] PostGIS `ST_DWithin(..., 20)` deduplication with haversine fallback; verified 11 m second report grouped into the same site
- [x] Frontend privacy/transparency notice before submission
- [x] Video mode: sharpest keyframe (Laplacian) + sampled-frame PII boxes with nearest-sample interpolation across frames, sanitized MP4 + thumbnail
- [x] Auth-bound ingestion: `user_id` from Supabase token, `GET /api/v1/sites`, `/reports/feed`, `/users/me/activity`
- [x] Frontend `CaptureModal` with photo/video, 5–10s clip, GPS/timestamp lock at capture, 3-step progress, and instant map + activity sync
- [x] Model chain is env-configurable (requested Gemini names first, known-good fallbacks)

### Authentication
- [x] Supabase Auth endpoints: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/signout`
- [x] Only EcoTrace-created accounts can log in (`app_metadata.ecotrace_account` flag); pre-existing Supabase users get 403 and must sign up
- [x] Duplicate sign-ups rejected; session token attached to all API calls; report ingestion derives user id from the token
- [x] Frontend Account tab with real sign-in/sign-up form, session restore, sign out, error states
- [x] Auth is **never mocked** — it always calls the backend, even when civic data is in mock mode

### Frontend
- [x] React 19 + TypeScript + Vite 8 + Tailwind CSS 4, mobile-first layout
- [x] Leaflet + OpenStreetMap raster tiles; cluster markers, severity pins, sanitized evidence, popups
- [x] Default view at Chitkara University, Rajpura (`30.5157, 76.6592`)
- [x] "Use my current location" with browser permission prompt, exact GPS retry with lighter accuracy, IP-based opt-in fallback
- [x] Live camera only — no file input; snapshot + 5–10 s walking video via MediaRecorder
- [x] GPS lock ≤ 30 m, missing-bin mode, locked three-pillar scorecards, human-in-the-loop complaint modal (copy / PDF / mailto)
- [x] HTTPS dev mode (`npm run dev:https`) for phone camera/location
- [x] Token-aware API client mapped to the real backend endpoints

### Verification
- [x] Backend: **57 tests** passing, typecheck + build clean
- [x] Frontend: **20 tests** passing, build + lint clean
- [x] `npm audit` → 0 vulnerabilities on both modules
- [x] Live smoke tests passed for all Phase 3–5 flows and auth against Supabase

---

## ✅ Hardening pass (testing branch, 22 Nov 2026)

### Security
- [x] **JWT enforced on every write route** — votes, backers, notes, cleanup claims, photo flags, scans, `/reports`, `/users/me/*`; the spoofable `x-user-id` header and body `userId` fallbacks were removed entirely
- [x] `requireUser()` helper + `authErrorStatusCode()` mapping in `services/auth/requestUser.ts`
- [x] **Rate limiting** via `@fastify/rate-limit`: global 300 req/min, `/api/auth/*` capped at 10 req/min in an encapsulated plugin
- [x] **RLS enabled on all 11 civic tables** (defence-in-depth; backend uses the service role): public read on sites/reports/area_scores, owner-only read on notes, votes, scans, cleanup claims (uploader_id), scan_frames (via session join), site_backers, photo_flags (reporter_id); letters readable by authenticated users

### Storage
- [x] **Both Supabase Storage buckets created by migration**: `ecotrace-raw-private` (private) + `ecotrace-sanitized-public` (public), 15 MB limit, MIME allowlist; client write access revoked
- [x] `services/storage/mediaStorage.ts` with `uploadRaw()` / `uploadSanitized()`
- [x] `/api/v1/reports` mirrors raw → private bucket, sanitized → public bucket (best-effort; local disk remains authoritative offline). Raw bytes never touch the public bucket

### Microservice
- [x] **`POST /internal/cleanup/validate`** — before/after cleanup validation (same-photo reject, distance gate, Gemini waste-gone analysis); sync handler so the Gemini SDK never blocks the event loop
- [x] **`POST /internal/summarize-notes`** — AI note briefing with extractive fallback (verified live: `"source":"ai"`)
- [x] Both endpoints live-tested; `/health` stays responsive during Gemini calls

### Frontend ↔ live backend (master pipeline wiring)
- [x] **`context/ReportContext.tsx`** — shared store: on 201 from `POST /api/v1/reports`, the new report is applied to the map pins AND prepended to the activity feed instantly (no refetch); `focusReportId` drives fly-to + popup
- [x] **`components/ReportForm.tsx`** — capture + submit with the real-time "AI is scanning for privacy & classifying trash…" button state, fresh GPS (`enableHighAccuracy`, `maximumAge: 0`) + ISO timestamp locked at capture
- [x] **`components/LiveMap.tsx`** — Leaflet map fed by ReportContext; popup shows blurred evidence, 🔒 blur count, trash type, detected items, GPS, captured_at, masked origin IP
- [x] **`components/ActivitySection.tsx`** — user reports with sanitized thumbnail, severity, captured_at/GPS/IP, `VERIFIED • LIVE ON MAP` badge and "View on Map"
- [x] Backend 201 response now mirrors the `FeedReport` contract (`id`, `sanitized_media_url`, `severity`, `site_status`, boundary fields) so the optimistic path renders complete pins
- [x] MapPage/ActivityPage rewired to LiveMap/ActivitySection; typecheck, lint, 20 tests, production build all green

---

## ⬜ To do / remaining

### Backend roadmap gaps
- [ ] **2.4** Dustbin proximity engine (nearest bin within 3 km)
- [ ] **2.5** No-bin zone detection (5+ unique reporters)
- [ ] `@fastify/rate-limit` for `/auth/*` — ✅ done 22 Nov; refresh tokens, password reset, email verification remain
- [ ] Role model (`citizen`, `authority`, `admin`) enforcement beyond the stored column
- [ ] Presigned upload URLs (`POST /uploads/sign`) as an alternative to direct multipart

### Frontend ↔ live backend
- [ ] Set `VITE_USE_MOCK_API=false` and point `VITE_API_BASE_URL` at a reachable backend
- [ ] Put the backend behind HTTPS (Cloudflare/ngrok tunnel) so the phone's HTTPS page can call it (no mixed content)
- [ ] End-to-end test: real sign-up → capture → report → map → letter → sign-out on a phone

### Data & QA
- [ ] Add sample media fixtures to `testing/` (waste dumps, faces/plates, non-waste selfies)
- [ ] Add integration/load tests and 20 m deduplication race-condition tests
- [ ] Clean smoke-test rows from Supabase before any real rollout (2 sites, 2 reports, backers, votes, flags, notes, claims, scans currently exist)
- [ ] Import boundary GeoJSON and the SWM 2026 corpus into the microservice prompt/data folders

### Delivery
- [ ] CI pipeline (typecheck, tests, build for both modules)
- [ ] Deployment (frontend static host, backend container, microservice container)
- [ ] Merge `testing` → `staging` → `main` via reviewed PRs when the team is ready

---

## Quick commands

```bash
# Backend
cd backend
cp .env.example .env          # fill Supabase values (already done locally)
npm run db:setup              # migrate + verify tables
npm run dev                   # http://localhost:8000
npm test && npm run typecheck

# Frontend
cd frontend
npm run dev                   # http://localhost:5173 (mock civic data, real auth)
npm run dev:https             # https://<lan-ip>:5173 for phone camera/location
npm test && npm run build && npm run lint
```

## Known caveats
- The frontend still defaults to **mock civic data** (`VITE_USE_MOCK_API=true`); auth is real regardless.
- The dev HTTPS certificate is self-signed — phones must accept the warning once.
- `backend/.env` contains live Supabase credentials and is intentionally gitignored.
- Smoke-test data remains in Supabase; treat it as disposable.
