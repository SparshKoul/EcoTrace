# EcoTrace — Frontend

The citizen-facing client for **EcoTrace: AI-Powered Environmental Tracking & Civic Waste Action**. It is a mobile-first React app for capturing live environmental evidence, viewing verified dump sites on a map, reading locality accountability scorecards, and reviewing — never auto-sending — a legally cited complaint draft grounded in the Solid Waste Management (SWM) Rules, 2026.

This folder is the `./frontend` module of the EcoTrace monorepo. It currently runs standalone in mock-data mode and is designed to plug into the Fastify core API and the FastAPI AI microservice as they are built.

---

## Quick start

```bash
cd EcoTrace/frontend
npm install
cp .env.example .env.local
npm run dev          # http://localhost:5173
```

The dev server is on port `5173`. With the default `.env.example` values the app runs entirely on built-in sample data — no backend, database, or API keys are required.

---

## Tech stack

| Layer | Technology | Version | Role in this folder |
| :--- | :--- | :--- | :--- |
| UI framework | **React** + `react-dom` | 19.3.1 | Component model, hooks, `StrictMode` root |
| Language | **TypeScript** | ~6.0.3 | Strict mode, `noUnusedLocals`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` |
| Build tool | **Vite** + `@vitejs/plugin-react` | 8.3.8 / 6.3.0 | Dev server, HMR, production bundling |
| Styling | **Tailwind CSS** + `@tailwindcss/vite` | 4.3.5 | Utility classes plus a custom `@theme` token layer in `src/index.css` |
| Maps | **Leaflet** + **React Leaflet** (+ `@types/leaflet`) | 1.9.4 / 5.0.0 | Interactive dump-site map, custom markers, popups, display clustering |
| PDF export | **jsPDF** | 4.2.1 | One-click "Download PDF" for the citizen complaint draft |
| Unit tests | **Vitest** + **jsdom** | 5.1.1 / 30.1.2 | Pure-domain tests for geo math, capture gates and score formulas |
| Component test tooling | `@testing-library/react`, `jest-dom`, `user-event` | 16 / 7 / 14 | Installed and ready for UI-level tests |
| Linting | **ESLint** + `typescript-eslint` + `@eslint/js` + `globals` | 10 / 8 / 10 | Flat config in `eslint.config.js` |
| Package manager | npm | 10+ | `package-lock.json` committed |

### Browser platform APIs used (no extra packages)

| API | Used for |
| :--- | :--- |
| `navigator.mediaDevices.getUserMedia` | Live rear-facing camera stream (`facingMode: "environment"`) |
| `MediaRecorder` | 5–10 second "walking mode" video capture |
| `HTMLCanvasElement.toBlob` | Converting a live video frame to a `image/webp` evidence blob |
| `navigator.geolocation.watchPosition` | Continuous high-accuracy GPS fix with `enableHighAccuracy: true` |
| `navigator.clipboard.writeText` | "Copy text" on the complaint modal |
| `FormData` + `fetch` | Multipart submission to `POST /api/v1/reports` |
| `mailto:` URI | Opening the complaint draft in the citizen's mail app |
| `online` / `offline` events | Blocking submission while offline, without blocking capture |

> Fonts are referenced in CSS as `Hanken Grotesk` / `Baloo 2` with system-font fallbacks. They are **not** bundled as npm packages in this commit; the UI is fully legible without them.

---

## npm scripts

| Script | What it does |
| :--- | :--- |
| `npm run dev` | Start the Vite dev server on port 5173 (also reachable on the LAN) |
| `npm run dev:https` | Start it over HTTPS with a local dev certificate — required for the browser location prompt on other devices |
| `npm run build` | `tsc --noEmit` type-check followed by a production Vite bundle into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint over the project using `eslint.config.js` |

---

## Environment variables

Copy `.env.example` to `.env.local`. All variables are optional.

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Base URL of the Fastify core API for all `/api/v1/*` calls |
| `VITE_USE_MOCK_API` | `true` | When true, serves local sample sites/areas/activity and a sample complaint instead of calling the backend |
| `VITE_TILE_URL` | OpenStreetMap raster template | Map tile source; must contain `{s}`, `{z}`, `{x}`, `{y}` placeholders |
| `VITE_TILE_ATTRIBUTION` | `© OpenStreetMap contributors` | Attribution rendered in the map corner |
| `VITE_PILOT_LAT` | `30.5157` | Initial map centre latitude (Chitkara University, Rajpura, Punjab) |
| `VITE_PILOT_LNG` | `76.6592` | Initial map centre longitude |

---

## Folder structure

```
frontend/
├── .env.example                  # Environment template
├── .gitignore                    # node_modules/, dist/, .env.local
├── index.html                    # App shell and root mount
├── eslint.config.js              # ESLint flat config
├── package.json / package-lock.json
├── tsconfig.json                 # Strict TypeScript config
├── vite.config.ts                # React + Tailwind plugins, Vitest config
├── public/
│   └── favicon.svg               # EcoTrace camera mark
├── src/
│   ├── main.tsx                  # React root, AppProvider, global CSS
│   ├── App.tsx                   # Header, tab router, bottom nav, toast host
│   ├── navigation.ts             # Tab type and bottom-nav definitions
│   ├── types.ts                  # Shared domain types (Site, Area, GpsFix,EvidenceAnalysis, ComplaintLetter…)
│   ├── index.css                 # Tailwind import, @theme tokens, Leaflet and print overrides
│   ├── config/
│   │   └── rules.ts              # PRD constants + env parsing (GPS 30 m, merge 20 m, quorum 10…)
│   ├── domain/
│   │   ├── geo.ts                # Haversine distance, distance formatting, display-cluster keys
│   │   ├── captureGates.ts       # Declarative capture/submit availability rules
│   │   └── scores.ts             # Three-pillar score formulas + locked state
│   ├── hooks/
│   │   ├── useGps.ts             # watchPosition hook, accuracy and denial state
│   │   └── useCamera.ts          # getUserMedia, snapshot, MediaRecorder walking video
│   ├── services/
│   │   └── api.ts                # Mock + real HTTP client, multipart submission, sample evidence
│   ├── state/
│   │   └── AppContext.tsx        # Sites, areas, activity, GPS, online/session, toast, sendReport
│   ├── components/
│   │   ├── capture/CapturePanel.tsx       # FR-1.1–FR-1.3 capture UI
│   │   ├── map/SiteMap.tsx                # FR-1.4 map, markers, clusters, popups
│   │   ├── areas/Scorecard.tsx            # Three-pillar scorecards and locality panel
│   │   ├── complaint/ComplaintModal.tsx   # FR-1.5 copy / PDF / mailto
│   │   ├── layout/BottomNav.tsx           # Mobile five-tab navigation
│   │   └── ui/                            # Button, Chip, GpsBadge, Toast primitives
│   └── pages/
│       ├── MapPage.tsx           # Map + overlays + complaint/scorecard dialogs
│       ├── AreasPage.tsx         # Area scorecard list
│       ├── ActivityPage.tsx      # Submitted reports and live PROCESSING status
│       └── AccountPage.tsx       # Local session toggle, connectivity, how-it-works
└── tests/
    ├── setup.ts                  # Test environment setup
    ├── geo.test.ts               # Distance + cluster tests
    ├── gates.test.ts             # GPS/camera/sign-in gating tests
    └── scores.test.ts            # Quorum and score formula tests
```

---

## Features implemented

| PRD requirement | Status | Where |
| :--- | :--- | :--- |
| **FR-1.1** Live capture enforcement | Done | `src/hooks/useCamera.ts`, `src/components/capture/CapturePanel.tsx` |
| **FR-1.2** Hardware geolocation lock (≤ 30 m) | Done | `src/hooks/useGps.ts`, `src/domain/captureGates.ts`, `src/components/ui/GpsBadge.tsx` |
| **FR-1.3** Infrastructure deficit / "Missing Bin" mode | Done | `CapturePanel.tsx` (`missing bin` tab) |
| **FR-1.4** Interactive cluster map + scorecards | Done | `src/components/map/SiteMap.tsx`, `src/components/areas/Scorecard.tsx` |
| **FR-1.5** Human-in-the-loop complaint modal | Done | `src/components/complaint/ComplaintModal.tsx` |

### FR-1.1 — Live capture, no gallery uploads

- **There is no `<input type="file">` anywhere in the app.** Evidence can only originate from a live `MediaStream`.
- `getUserMedia` requests `facingMode: { ideal: "environment" }` at an ideal 1920×1080, with audio enabled for walking video.
- **Snapshot mode** draws the current video frame to a canvas (longest side capped at 2048 px) and exports it as a WebP blob at quality 0.85.
- **Walking mode** uses `MediaRecorder`, picking the first supported MIME type from `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/webm`, `video/mp4`. Recording auto-stops at 10 seconds; clips shorter than 5 seconds are rejected with a user-facing message. A live progress bar shows elapsed time.
- The camera is fully stopped (all tracks ended) when leaving the panel or clearing capture.

### FR-1.2 — GPS lock

- `watchPosition` runs continuously with `enableHighAccuracy: true`, `maximumAge: 5000`, `timeout: 30000`.
- A fix is accepted only when `accuracyM ≤ 30` and no older than 10 seconds. Rough or stale fixes show a "need ≤ 30 m" message instead of a generic error.
- Permission denial, absence of geolocation support, and temporary errors are surfaced as distinct badge states.
- Capture gates in `src/domain/captureGates.ts` are declarative: snapshot, walking video, missing-bin marker and final submit each compose their own ordered rules (busy → camera → GPS → offline → sign-in → waste type). The first blocking rule supplies the message shown to the citizen.

### FR-1.3 — Missing-bin mode

- A dedicated capture tab marks "no accessible dustbin within 1 km" with no photo requirement.
- It still requires an accurate GPS fix, an online connection and a signed-in session.
- The marker appears immediately in Activity with status `PROCESSING` and type `no_bin`.

### FR-1.4 — Map and scorecards

- See the dedicated **Maps** section below.
- Site popups show sanitized evidence images only (`evidenceUrl` from the public/sanitized bucket), report and distinct-reporter counts, severity 0–100, verified boundary text, and buttons for the complaint draft and locality scorecard.
- Scorecards show three 0–100 pillars — **City Clearing**, **Citizen Dumping**, **Bin Access** — and remain **locked until 10 distinct reporters** have submitted verified reports. A locked card shows only "N more reporters needed"; no partial scores are revealed.
- Ward numbers are never guessed: only verified ULB / MLA / MP names from `CivicBoundary` are displayed.

### FR-1.5 — Complaint modal

- Opened only by an explicit click in a map popup. Nothing is emailed or sent automatically.
- Fetches a `ComplaintLetter` addressed to the Municipal Commissioner / ULB head with the MLA and MP in CC.
- Shows a banner explaining that every quoted rule passed the deterministic exact-substring check against the SWM Rules, 2026 corpus (the check itself is a backend responsibility).
- **Copy text** → `navigator.clipboard.writeText`.
- **Download PDF** → `jsPDF` builds an A4 document with the full letter body.
- **Open in mail app** → a `mailto:` URI with encoded subject and body; the citizen reviews and sends it themselves.
- Closes with the close button, Escape, or a backdrop click.

---

## Maps: which map stack is used and how

**Stack:** Leaflet `1.9.4`, wrapped by React Leaflet `5.0.0`, with OpenStreetMap raster tiles.

> The reference blueprint used MapLibre GL with vector styles. This client deliberately uses Leaflet instead: it is lighter, needs no style JSON or API token, and is sufficient for point-based civic reporting. No Mapbox account or Mapbox GL JS is required.

### How it is configured

- `src/components/map/SiteMap.tsx` mounts `<MapContainer>` centred on **Chitkara University, Rajpura, Punjab** (`30.5157, 76.6592`) by default at zoom 12.
- `<TileLayer>` reads its URL and attribution from `VITE_TILE_URL` / `VITE_TILE_ATTRIBUTION`. The default is the public OpenStreetMap raster tile service; swapping in another provider (e.g. a self-hosted tile server or a satellite layer) requires only changing those two environment variables — no code changes.
- Tile attribution is rendered in the map corner by Leaflet. Keep attribution when changing providers.

### Current location

- On first load the map starts at Chitkara University and shows a **"See sites near you?"** card. Choosing **"Use my current location"** calls `navigator.geolocation.getCurrentPosition` (which triggers the browser's own **"Allow location?"** prompt), then flies the map to the returned coordinates at a closer zoom and drops a blue "You are here" marker. This button uses **exact device location only** — it never substitutes an IP-derived position. **"Not now"** keeps the default view.
- A **"◎ My location"** button stays in the top overlay so the citizen can re-centre at any time.
- The one-shot request lives in `useGps.locate()` and is exposed through `AppContext`; the continuous `watchPosition` used by capture gates is separate.
- If location is denied, unavailable, or blocked by an embedded preview / non-HTTPS context, the prompt shows the **specific reason inline** with **Try again**, **Use approximate location**, and **Keep Chitkara view** actions — no dead-end toast.
- **Exact GPS requires a secure context.** Browsers only show the "Allow location?" prompt on `localhost` or HTTPS — this is a browser security rule, not an app setting. If the page is opened over plain `http://<ip>` or in an iframe without `allow="geolocation"`, no code can obtain the device's exact position. The prompt then explains the specific reason inline.
- **For visitors on other devices:** run `npm run dev:https`. Open the printed `https://<your-lan-ip>:5173` URL on their device, accept the local development certificate warning once, then tap **Use my current location** — the browser's permission prompt appears and the map centres on the device's exact GPS position. A public HTTPS tunnel (`npx cloudflared tunnel --url http://localhost:5173` or `npx ngrok http 5173`) works too.
- If the user previously chose **Block**, Chrome will not ask again. Reset it via the tune/lock icon beside the URL → **Site settings → Location → Allow**, or in Chrome Settings → Privacy and security → Site settings → Location.
- **Optional manual fallback:** only after the exact request fails, a separate **Use approximate location** button appears. It uses a public IP lookup (`ipwho.is`, backup `ipapi.co`) to centre the map near their city, with an **"Approximate · city"** chip. This is city-level only and is never accepted for reporting — capture gates still require a ≤ 30 m device fix.
- Mock sites are generated around the same default centre, so the pilot view always has sample reports before a real backend is connected.

### Markers and severity

- Each site or cluster is drawn with a Leaflet `L.divIcon` (an HTML/CSS pin rather than an image asset), so its appearance is fully controlled by `src/index.css` (`.eco-pin`, `.eco-cluster`).
- The pin label is the site **severity (0–100)** assigned by the AI service and verified by the backend. The pin fill colour is the **report type** colour: dump `#c5221f`, no dustbin `#e37400`, water `#1967d2`, construction `#5d4037`, overflowing/broken bin `#7b3fa6`.
- Verified sites get an extra outline ring. Colour is never the only cue — type text and severity number are also shown.
- Clicking a cluster flies the map to its centroid at a higher zoom; clicking a single pin opens its popup.

### Clustering

- Clustering is a **client-side display optimisation only**. `clusterKey()` in `src/domain/geo.ts` snaps each site to a latitude-scaled grid cell derived from the current zoom level, so nearby sites share one numbered marker.
- It does **not** implement deduplication. The authoritative merge rule is the backend's PostGIS `ST_DWithin(location, report_point, 20)` check, mirrored as `RULES.SITE_MERGE_RADIUS_M = 20`.
- The grid is recomputed from the `zoomend` event, so drilling into a cluster progressively separates its sites.

### Boundaries

- Geographical attribution (ULB, MLA, MP) comes from backend `ST_Contains` lookups against verified GeoJSON/PostGIS polygons. The frontend only renders those names; it does no boundary inference of its own.

---

## Domain rules mirrored from the PRD

Defined in `src/config/rules.ts`. Keep these in sync with the backend and microservice.

| Constant | Value | Meaning |
| :--- | :--- | :--- |
| `GPS_MAX_ACCURACY_M` | 30 | Minimum GPS accuracy for any submission |
| `GPS_MAX_AGE_MS` | 10,000 | Maximum age of an accepted GPS fix |
| `SITE_MERGE_RADIUS_M` | 20 | PostGIS spatial deduplication radius |
| `MIN_VERIFIED_REPORTS` | 10 | Distinct reporters before scores unlock |
| `NO_BIN_RADIUS_M` | 1,000 | "No dustbin within 1 km" definition |
| `WALKING_MIN_MS` / `WALKING_MAX_MS` | 5,000 / 10,000 | Walking-video length window |

---

## Data flow and API contract

```
CapturePanel  →  useCamera / useGps  →  captureGates
      ↓
AppContext.sendReport()
      ↓
services/api.submitReport()  →  POST /api/v1/reports  (multipart: type, mode, lat, lng,
                                                        accuracy_m, note, media[n])
      ↓
202 { report_id, status: "PROCESSING" }  →  Activity list  →  refresh sites/areas
```

**Mock mode** (`VITE_USE_MOCK_API=true`, default) replaces the network with local sample sites, areas, activity items and a complaint letter. The sample letter quotes are real exact-text clauses taken from the reference SWM 2026 corpus; in production the backend re-verifies every citation before the letter is shown. Sample evidence images are inline SVG placeholders labelled "sanitized" — no raw personal media is ever represented.

The shared `EvidenceAnalysis` type in `src/types.ts` documents the response shape expected from `POST /internal/analyze-evidence`: `is_waste`, `confidence`, `waste_stream`, `severity`, `pii_blurred`, `sanitized_image_url`, `reject_reason`, `citations`. This gives `backend/` and `microservice/` a contract to implement against.

---

## Design system

`src/index.css` defines Tailwind v4 `@theme` tokens:

- **Surfaces:** page `#fbf6ee`, surface `#fffdf8`, tile `#f4ecdf`, ink `#221c15`, muted `#5f5446`, line `#e5d9c7`
- **Brand:** accent teal `#0b7a73`, sun yellow `#ffc23d`, coral `#ff7a59`
- **Radii:** cards 16 px, sheets 28 px; buttons are pills with a hard ink "sticker" shadow
- **Accessibility:** 44 px minimum touch targets, 3 px focus ring, `prefers-reduced-motion` cuts animation to 1 ms, print styles hide navigation and controls for clean PDF/print output
- Layout is mobile-first with a fixed five-slot bottom bar that accounts for `env(safe-area-inset-bottom)`

---

## Testing and verification

```bash
npm test        # 19 tests across 4 files
npm run build   # tsc --noEmit && vite build
npm run lint    # eslint .
```

All three commands pass in this commit. Tests cover:

- Haversine distance, the 20 m merge radius, distance formatting and cluster keys
- Capture gates: GPS accuracy > 30 m blocks, recorder support, missing-bin GPS requirement, sign-in and offline cases, waste-type requirement
- Score quorum locking and all three score formulas
- `useGps.locate()` with mocked geolocation: success returns a fix, denial returns an actionable error, insecure context refuses with an HTTPS message
- `useGps.locateByIp()` with mocked fetch: city-level fallback result, and a clear error when all IP providers fail

---

## Reference policy

`../ecotrace_refrence` (the git-ignored JunkSnap clone) was used **strictly as a local blueprint** for domain rules — 20 m merge radius, 10-reporter threshold, SWM 2026 clauses, administrative boundary logic — and for UX patterns. **No code was imported from it** into this folder.

## Current limitations / next steps

- Runs on mock data until the Fastify backend exists; real multipart submission code is present but untested against a live server.
- Geofencing around dustbins is not implemented client-side; "near bin" is a backend-provided flag.
- Component-level UI tests are scaffolded (Testing Library is installed) but only pure-domain tests are written so far.
- Real sample media (waste dumps, images with faces/plates, non-waste selfies) belongs in `../testing/` and is not included here.
