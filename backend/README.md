# EcoTrace Backend

Node.js 22+ / Fastify 5 / TypeScript core API. Phases 1–2 (ingestion, 20 m clustering, boundary resolution, sites API) are in `src/routes/reports.ts` and `src/routes/sites.ts`; **Phase 3 (Civic Action & Cleanup Verification)** is implemented in the modules listed below.

## Run

```bash
npm install
# DATABASE_URL is required by config, but a dummy URL is fine for offline/hackathon mode:
DATABASE_URL='postgres://user:pass@127.0.0.1:5432/ecotrace' npm run dev
npm test          # node:test via tsx
npm run typecheck
npm run build
```

## Supabase setup

Supabase is a hosted PostgreSQL database, so the backend keeps using `pg` + SQL — no ORM rewrite. Copy `.env.example` to `.env` and fill in:

1. **`DATABASE_URL`** — Supabase → Project Settings → **Database → Connection string → URI**. Use the **transaction pooler** URL (port `6543`) for the running app; the direct `5432` URL also works for migrations. Replace `[YOUR-PASSWORD]` with your database password.
2. **`SUPABASE_URL`** — Project Settings → API → Project URL.
3. **`SUPABASE_ANON_KEY`** / **`SUPABASE_SERVICE_ROLE_KEY`** — Project Settings → API → Project API keys. The service-role key bypasses Row Level Security and is **server-only**; never put it in the frontend or commit `.env` (it is gitignored).
4. TLS is auto-detected for Supabase hosts. Override with `DB_SSL=true` / `DB_SSL=false` if needed.

Then apply the schema and verify:

```bash
npm run db:setup     # runs db:migrate + db:check
```

`db:migrate` applies `src/db/schema.sql` idempotently (all `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`). `db:check` verifies connectivity, lists public tables, and fails if any EcoTrace table is missing. Neither command prints credentials — only the database host. Health is also exposed at `GET /health` on the running server.

Schema notes for Supabase: UUID defaults use PostgreSQL's built-in `gen_random_uuid()`, so no extension creation or elevated privileges are required.

### Storage scaffold

`src/db/supabase.ts` creates lazy Supabase clients and `src/services/storage/SupabaseStorage.ts` exposes `uploadRaw()` (private bucket) and `uploadSanitized()` (public bucket) for the PRD's dual-bucket isolation. These are ready for the ingestion pipeline; no media is uploaded automatically yet.

If the database is unreachable, all Phase 3–5 routes fall back to an in-memory store seeded with site `site_demo_chitkara` at Chitkara University (`30.5157, 76.6592`), so every endpoint below can be exercised without infrastructure.

---

## Phase 3 implementation map

| Roadmap step | Implementation |
| :--- | :--- |
| **3.1 Cleanup Claim Pipeline** | `src/routes/cleanup.ts`, `src/services/sites/CleanupService.ts`, `src/domain/sites/SiteCleanup.ts`, `src/db/schema.sql` (`cleanup_claims`) |
| **3.2 Civic Letter Drafting Engine** | `src/routes/letters.ts`, `src/services/letters/LetterService.ts`, `src/services/letters/LetterDrafter.ts`, `src/db/schema.sql` (`letters`) |
| **3.3 Rule Quote Verifier** | `src/services/letters/QuoteVerifier.ts`, `src/domain/letters/RuleBook.ts`, corpus in `data/rules/` |
| **3.4 Community Quorum Verification** | `src/routes/backers.ts`, `src/services/sites/BackerService.ts`, `src/domain/sites/Backers.ts`, `src/db/schema.sql` (`site_backers`) |
| **3.5 Cleanup Validation (AI Check)** | `src/services/sites/CleanupValidator.ts`, `validateCleanup()` in `CleanupService.ts` |

### Domain rules enforced

- **After-photo proximity:** a cleanup claim is rejected when its GPS is more than **50 m** from the site (`CLEANUP_NEAR_SITE_M`).
- **Claim lifecycle:** `open/verified → cleaning (checking) → cleaned (accepted)` or `reopened (rejected)`. A second claim is rejected with `cleanup_pending` while one is checking; cleaned sites return `already_cleaned`.
- **10-backer rule:** only **distinct user ids** count (`PRIMARY KEY (site_id, user_id)` plus an idempotent in-memory Set). At 10 backers the site becomes `verified`, escalates, and gains a 10-point severity boost. The boost applies once (`just_verified`).
- **Zero-hallucination quotes:** every citation must be an exact, whitespace-normalised, word-boundary-aligned substring of a rule in `data/rules/rules.json`, with a matching gazette `source_sha256`. Unknown, altered, or mid-word quotes are stripped. If no quote verifies, the letter falls back to a template (`template_fallback: true`) and contains no invented citations.
- **AI validation:** `validateCleanup()` calls the microservice at `${AI_SERVICE_URL}/internal/cleanup/validate` with before/after URLs and distance. If the service is unavailable, a deterministic offline check rejects the case when the after-photo URL equals the before-photo URL; otherwise it accepts at confidence 0.85. An explicit `decision` in the request always wins.

### Legal corpus

`data/rules/rules.json` and `data/rules/texts/swm_rules_2026_en.txt` were extracted from the gitignored reference repository. They contain the Solid Waste Management Rules, 2026 (S.O. 388(E), in force 1 April 2026) plus related 2026/2025 rules and the official PDF hashes. `QuoteVerifier` never fabricates a clause — citations are selected from this file by `ruleIdsForWasteStream()`.

---

## Phase 3 endpoints

All routes are mounted under `/api`.

| Method | Path | Purpose | Response |
| :--- | :--- | :--- | :--- |
| `POST` | `/sites/:id/cleanup` | Submit an after-photo claim | `202 { cleanup_id, site_id, status, site_status, distance_m }` |
| `GET` | `/sites/:id/cleanup` | Claim history for a site | `{ count, claims }` |
| `POST` | `/cleanup/:id/validate` | Run AI check or supply explicit decision | `{ status, ai_confidence, reason, site }` |
| `POST` | `/sites/:id/backers` | Back a site (distinct user) | `{ count, needed, verified, escalated, severity, just_verified }` |
| `GET` | `/sites/:id/backers` | Current quorum state | `{ count, needed, verified, escalated, severityBoost }` |
| `GET` | `/letters/site/:id` | Verified complaint draft | Letter object with `citations`, `verifier`, `template_fallback` |

### Examples

```bash
BASE=http://127.0.0.1:8000/api
SITE=site_demo_chitkara

# 1. Ten distinct backers verify and escalate the site
for i in $(seq 1 10); do
  curl -s -X POST "$BASE/sites/$SITE/backers" \
    -H 'Content-Type: application/json' -d "{\"userId\":\"user-$i\"}"
done

# 2. Claim a cleanup with an after-photo taken near the site
curl -s -X POST "$BASE/sites/$SITE/cleanup" \
  -H 'Content-Type: application/json' \
  -d '{"afterPhotoUrl":"https://example.com/after.jpg","userId":"worker-1","latitude":30.5158,"longitude":76.6592}'

# 3. Validate it (omit "decision" to call the AI service)
curl -s -X POST "$BASE/cleanup/<cleanup_id>/validate" \
  -H 'Content-Type: application/json' -d '{"decision":"accepted","confidence":0.94}'

# 4. Read the verified complaint draft
curl -s "$BASE/letters/site/$SITE"
```

Error responses: `400` validation / not-near-site, `404` site or claim not found, `409` `cleanup_pending` / `already_cleaned` / `site_unavailable`.

---

---

## Phase 4 — Community Engagement & Citizen Verification

| Roadmap step | Implementation |
| :--- | :--- |
| **4.1 Community Voting & Backing** | `src/routes/votes.ts`, `src/services/sites/VoteService.ts`, `src/domain/sites/VoteTally.ts`, `site_votes` table |
| **4.2 Community Notes & Observations** | `src/routes/notes.ts`, `src/services/phase4Repository.ts`, `notes.user_id` column |
| **4.3 AI Notes Summarizer** | `src/services/notes/NoteSummarizer.ts`, `src/domain/notes/NoteSummary.ts` |
| **4.4 User Report History** | `src/routes/activity.ts`, `getActivity()` in `phase4Repository.ts`, `reports.user_id` column |
| **4.5 Photo Abuse & Flagging** | `src/routes/flags.ts`, `src/services/flags/PhotoFlagService.ts`, `src/domain/flags/PhotoFlags.ts`, `photo_flags` table |

### Domain rules enforced

- **Voting:** one latest vote per user per site (`confirm | reject | cleaned`). Votes must be within **1000 m** of the site (`VOTE_RADIUS_M`); a confirm vote also counts toward the 10-backer quorum. A site is rejected when distinct reject voters exceed backers by **3 or more** (safety valve).
- **Notes:** 1–2000 characters, attributed to a user. `GET /sites/:id/notes/summary` caches a briefing; it calls `${AI_SERVICE_URL}/internal/summarize-notes` when available and otherwise builds a deterministic briefing from the citizen text only — never inventing content.
- **Activity:** `GET /users/me/reports` and `GET /users/me/activity` read the user id from the `x-user-id` header (or `?userId=`). Activity merges reports, votes, notes, and Phase 3 cleanup claims.
- **Flagging:** 3+ distinct reporters hide a photo pending moderation. Flags are keyed by **report id**; hidden photos are returned as `photo_url: null` with `pending_moderation: true` in My Reports and `photoHidden: true` in My Activity.
- `POST /reports` now accepts an optional `userId` so new reports appear in that user's activity.

### Phase 4 endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/sites/:id/vote` | Cast/replace a vote within 1000 m |
| `GET` | `/api/sites/:id/votes` | Current vote tally |
| `POST` | `/api/sites/:id/notes` | Add an observation |
| `GET` | `/api/sites/:id/notes` | List observations |
| `GET` | `/api/sites/:id/notes/summary` | AI or deterministic briefing |
| `POST` | `/api/photos/:id/flag` | Flag a report photo |
| `GET` | `/api/photos/:id/flag` | Moderation state for a photo |
| `GET` | `/api/users/me/reports` | My reports (hidden photos masked) |
| `GET` | `/api/users/me/activity` | My full activity feed |

`/api/users/:userId/reports` and `/api/users/:userId/activity` are also available as aliases.

```bash
BASE=http://127.0.0.1:8000/api
SITE=site_demo_chitkara

curl -s -X POST "$BASE/sites/$SITE/vote" -H 'Content-Type: application/json' \
  -d '{"userId":"voter-1","vote":"confirm","latitude":30.5158,"longitude":76.6592}'

curl -s -X POST "$BASE/sites/$SITE/notes" -H 'Content-Type: application/json' \
  -d '{"userId":"voter-1","content":"Bin was replaced on Monday."}'

curl -s "$BASE/sites/$SITE/notes/summary"

for i in 1 2 3; do
  curl -s -X POST "$BASE/photos/rpt_demo_1/flag" -H 'Content-Type: application/json' \
    -d "{\"reporterId\":\"reporter-$i\"}"
done

curl -s "$BASE/users/me/reports" -H 'x-user-id: demo-user'
```

Errors: `400` validation, `vote_too_far`, or `USER_ID_REQUIRED`; `404` site/report/photo not found.

---

---

## Phase 5 — Cleanliness Scores & Video Scanning

| Roadmap step | Implementation |
| :--- | :--- |
| **5.1 Area Cleanliness Scoring** | `src/routes/areas.ts`, `src/services/scores/AreaScoringService.ts`, `src/domain/scores/AreaScores.ts` |
| **5.2 City Ranking Leaderboard** | `src/routes/rankings.ts`, `getCityRanking()` in `AreaScoringService.ts` |
| **5.3 Continuous Video Scan Ingestion** | `src/routes/scans.ts`, `src/services/scans/ScanService.ts`, `src/domain/scans/ScanSession.ts`, `scan_sessions` / `scan_frames` tables |
| **5.4 Social Share Card Generator** | `src/routes/share.ts`, `src/services/share/ShareCardService.ts`, `src/domain/share/ShareCard.ts` |

### Domain rules enforced

- **Scores stay locked below 10 reporters** (same Sybil quorum as the frontend). The score is `0.6 × resolutionRate + 0.4 × velocityScore − reopenPenalty`, clamped to 0–100. `resolutionRate = cleaned / (cleaned + open)`, `velocityScore = 100 − 2 × avgCleanupHours` (40 when nothing has been cleaned), and the reopen penalty is `5 × reopenedCount`, capped at 30. Grades: good ≥ 70, warn ≥ 40, bad below 40.
- **Rankings** are worst-first across ward / MLA / MP areas whose name contains the requested `cityId`; locked areas are placed last and excluded from the ranked output.
- **Scan frames** require strictly increasing `t_ms`, a non-empty `photoUrl`, at most 600 frames and a 60 s maximum duration. Each batch reports accepted frames and per-frame rejection reasons; GPS fixes are counted separately. A session can be completed once (further frames are then rejected).
- **Share cards** are generated server-side as escaped SVG (1200×630) with status badge, before photo and sanitized after photo. Text is also returned for X/WhatsApp. All dynamic values are XML-escaped; nothing is posted to a social network automatically.

### Phase 5 endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/areas/:kind` | Scorecards for `ward`, `mla` or `mp` |
| `GET` | `/api/areas/:kind/:id/score` | One area score |
| `GET` | `/api/rankings/city/:cityId` | Worst-first city leaderboard |
| `POST` | `/api/scans/start` | Start a scan session (`{ userId? }`) |
| `POST` | `/api/scans/:id/frames` | Ingest a batch of `{ frames: [{ t_ms, photoUrl, latitude?, longitude?, accuracyM? }] }` |
| `GET` | `/api/scans/:id` | Session, progress and frames |
| `POST` | `/api/scans/:id/complete` | Close a session |
| `GET` | `/api/share/sites/:id` | Share link, text and card data |
| `GET` | `/api/share/sites/:id/card.svg` | Rendered SVG card (`image/svg+xml`) |

```bash
BASE=http://127.0.0.1:8000/api

curl -s "$BASE/areas/ward"
curl -s "$BASE/areas/mla/Rajpura%20Assembly%20Constituency/score"
curl -s "$BASE/rankings/city/rajpura"

SCAN=$(curl -s -X POST "$BASE/scans/start" -H 'Content-Type: application/json' -d '{"userId":"surveyor-1"}')
ID=$(echo "$SCAN" | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['id'])")
curl -s -X POST "$BASE/scans/$ID/frames" -H 'Content-Type: application/json' \
  -d '{"frames":[{"t_ms":0,"photoUrl":"https://example.com/f0.jpg","latitude":30.5157,"longitude":76.6592}]}'
curl -s -X POST "$BASE/scans/$ID/complete"

curl -s "$BASE/share/sites/site_demo_chitkara"
curl -s "$BASE/share/sites/site_demo_chitkara/card.svg"
```

Errors: `400` invalid area kind / validation, `404` area, scan session or site not found.

---

## Verification

`npm test` runs **51 tests** (18 suites), including Phase 3, 4 and 5 tests for:

- 10-backer quorum and distinct-user counting (`src/domain/sites/Backers.test.ts`)
- cleanup proximity, pending/conflict checks, and state transitions (`src/domain/sites/SiteCleanup.test.ts`)
- quote verification against the real SWM corpus, mid-word/altered quote rejection, citation stripping, and letter drafting (`src/services/letters/QuoteVerifier.test.ts`)
- one-latest-vote-per-user, vote radius, reject safety valve (`src/domain/sites/VoteTally.test.ts`)
- three-reporter photo hide threshold and repeat-flag deduplication (`src/domain/flags/PhotoFlags.test.ts`)
- deterministic note briefing content and note-count capping (`src/domain/notes/NoteSummary.test.ts`)
- score quorum locking, composite formula, reopen penalty and worst-first ranking (`src/domain/scores/AreaScores.test.ts`)
- scan frame monotonicity, duration/frame caps and progress counting (`src/domain/scans/ScanSession.test.ts`)
- SVG escaping and share-card/text generation (`src/domain/share/ShareCard.test.ts`)

All endpoint flows were also smoke-tested with PostgreSQL offline using the in-memory fallback: 9 backers stay unverified, the 10th verifies and escalates; a 1112 m after-photo is rejected with 400, an 11 m one is accepted with 202 and closes the site after validation; the generated letter had 3 verified citations with `template_fallback: false`.

Phase 4 smoke test: an 11 m confirm vote was accepted (and incremented the backer count), a 1590 m vote returned `vote_too_far` with 400; a note was added and the summary briefing listed all 4 observations with `source: "offline"`; three distinct flags moved `rpt_demo_1` to `hidden: true`, and both My Reports and My Activity then returned that photo as hidden.

Phase 5 smoke test: the ward score was locked (`score: null`, `needed: 10`) before the quorum and became `16` after 10 backers; the city leaderboard returned two areas ranked worst-first; a scan accepted 2 frames and rejected a duplicate `t_ms` plus a 61 s frame, then completed successfully; the share endpoint returned a link/text and the SVG card with `Content-Type: image/svg+xml`.

`npm audit` reports 0 vulnerabilities (zod was upgraded to 4.6.7 to clear a DoS advisory; the only required code change was `PORT: z.string().transform(Number).default(8000)` in `src/config/env.ts`).
