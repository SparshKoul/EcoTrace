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

Apply the schema when PostgreSQL is available: `npx tsx src/db/migrate.ts`.

If the database is unreachable, the Phase 3 routes fall back to an in-memory store seeded with site `site_demo_chitkara` at Chitkara University (`30.5157, 76.6592`), so every endpoint below can be exercised without infrastructure.

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

## Verification

`npm test` runs **31 tests** (12 suites), including Phase 3 tests for:

- 10-backer quorum and distinct-user counting (`src/domain/sites/Backers.test.ts`)
- cleanup proximity, pending/conflict checks, and state transitions (`src/domain/sites/SiteCleanup.test.ts`)
- quote verification against the real SWM corpus, mid-word/altered quote rejection, citation stripping, and letter drafting (`src/services/letters/QuoteVerifier.test.ts`)

All endpoint flows were also smoke-tested with PostgreSQL offline using the in-memory fallback: 9 backers stay unverified, the 10th verifies and escalates; a 1112 m after-photo is rejected with 400, an 11 m one is accepted with 202 and closes the site after validation; the generated letter had 3 verified citations with `template_fallback: false`.

`npm audit` reports 0 vulnerabilities (zod was upgraded to 4.6.7 to clear a DoS advisory; the only required code change was `PORT: z.string().transform(Number).default(8000)` in `src/config/env.ts`).
