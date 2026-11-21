# EcoTrace Backend: Complete Feature Roadmap & 2-Developer Work Division

This document outlines the complete sequential feature breakdown for the **EcoTrace** backend, ordered from foundational requirements to advanced capabilities, divided logically between **Developer 1** and **Developer 2** to enable parallel development with minimal conflicts.

---

## Architecture Overview & Division Strategy

```text
                           ┌────────────────────────────┐
                           │      Fastify Server        │
                           └──────────────┬─────────────┘
                                          │
            ┌─────────────────────────────┴─────────────────────────────┐
            ▼                                                           ▼
   [ DEVELOPER 1 TRACK ]                                       [ DEVELOPER 2 TRACK ]
  Core Engine & Spatial Hotspots                              Civic Action, AI & Intelligence
  ─────────────────────────────                               ────────────────────────────────
  • Server Foundation & Database                              • AI Microservice Client
  • Photo Upload & Report Intake                              • PII Blur & Content Moderation
  • 20m Spatial Clustering (Sites)                            • Ward & Political Boundary Mapping
  • Map Hotspots API (GET /sites)                             • Civic Letter Drafting Engine (PDF)
  • Cleanup Lifecycle & Claims                                • Community Notes & AI Summaries
  • Video/GPS Scan Ingestion                                  • Area Cleanliness Scoring Engine
```

---

## Phase-by-Phase Feature Breakdown

### Phase 1: Foundation & Ingestion Engine (Week 1 / Day 1)

| Step | Feature | Assignee | Description | Endpoints / Artifacts |
| :---: | :--- | :---: | :--- | :--- |
| **1.1** | **Server Bootstrap & Tooling** | **Dev 1** | Fastify v5 setup with TypeScript, CORS, Pino logger, error handling, health check. | `GET /healthz`<br>`backend/src/index.ts` |
| **1.2** | **Database & Configuration Layer** | **Dev 2** | Environment settings (`CoreSettings`, `DatabaseSettings`), DynamoDB/PostgreSQL connection adapters. | `src/settings/*`<br>`src/adapters/db/*` |
| **1.3** | **Presigned Photo Uploads** | **Dev 1** | Generates secure presigned S3/storage URLs for client photo uploads with size & MIME validation. | `POST /uploads/sign`<br>`ports/UploadSigner.ts` |
| **1.4** | **AI Microservice Client** | **Dev 2** | HTTP client communicating with `microservice/` to verify waste presence (YOLO/SigLIP) and return confidence. | `ports/MlVerifyClient.ts`<br>`adapters/HttpMlVerifyClient.ts` |
| **1.5** | **Waste Report Ingestion** | **Dev 1** | Endpoint to receive report metadata (GPS coordinates, photo URL, waste type: bin, open dump, debris). | `POST /reports`<br>`domain/Report.ts` |
| **1.6** | **Photo Moderation & Blur** | **Dev 2** | Face & license plate blurring pipeline using Rekognition/Sharp before photos are published. | `services/moderation/*`<br>`domain/moderation/*` |

---

### Phase 2: Spatial Hotspots & Administrative Boundary Engine

| Step | Feature | Assignee | Description | Endpoints / Artifacts |
| :---: | :--- | :---: | :--- | :--- |
| **2.1** | **Spatial Clustering (Same-Spot Merge)** | **Dev 1** | Algorithmic grouping: Reports within 20 meters of the same waste type automatically merge into a shared "Site". | `services/sites/SiteMerger.ts`<br>`domain/sites/Site.ts` |
| **2.2** | **Ward & Representative Mapping** | **Dev 2** | Reverse geocodes coordinates to administrative boundaries: Municipal Ward, MLA Assembly Seat, MP Lok Sabha Seat. | `services/location/*`<br>`domain/location/Seats.ts` |
| **2.3** | **Map Hotspots API** | **Dev 1** | High-performance endpoint for the frontend map; returns clustered waste markers with report counts and status. | `GET /sites`<br>`GET /sites/:id` |
| **2.4** | **Dustbin Proximity Engine** | **Dev 2** | Measures distance to nearest known public bin (within 3 km) to distinguish illegal dumping from bin shortages. | `domain/bins/KnownBin.ts`<br>`services/bins/*` |
| **2.5** | **No-Bin Zone Detection** | **Dev 1** | Flags an area as a "No-Bin Zone" when 5+ unique reports confirm an absence of public waste disposal facilities. | `domain/sites/NoBinZone.ts` |

---

### Phase 3: Civic Action & Cleanup Verification

| Step | Feature | Assignee | Description | Endpoints / Artifacts |
| :---: | :--- | :---: | :--- | :--- |
| **3.1** | **Cleanup Claim Pipeline** | **Dev 1** | Residents/authorities upload an "after photo" claiming a site is cleared; transitions site to `cleaning` state. | `POST /sites/:id/cleanup`<br>`domain/sites/SiteCleanup.ts` |
| **3.2** | **Civic Letter Drafting Engine** | **Dev 2** | Auto-generates formal grievance letters to the responsible Municipal Commissioner & copied to MLA/MP. | `GET /letters/site/:id`<br>`services/letters/*` |
| **3.3** | **Rule Quote Verifier** | **Dev 2** | Verifies quoted Solid Waste Management Rules against official government gazette texts (English & Hindi). | `services/letters/QuoteVerifier.ts`<br>`domain/letters/RuleBook.ts` |
| **3.4** | **Community Quorum Verification** | **Dev 1** | "10-Backer Rule": A site marks as verified once backed by 10 distinct users, escalating its urgency level. | `services/sites/Backers.ts`<br>`domain/sites/Backers.ts` |
| **3.5** | **Cleanup Validation (AI Check)** | **Dev 2** | Compares before & after photos via AI to confirm waste was genuinely removed before closing a site. | `services/sites/CleanupValidator.ts` |

---

### Phase 4: Community Engagement & Citizen Verification

| Step | Feature | Assignee | Description | Endpoints / Artifacts |
| :---: | :--- | :---: | :--- | :--- |
| **4.1** | **Community Voting & Backing** | **Dev 1** | Allows nearby residents to upvote ("Me Too") an existing dump site without creating a duplicate. | `POST /sites/:id/vote`<br>`domain/sites/VoteTally.ts` |
| **4.2** | **Community Notes & Observations** | **Dev 2** | Enables residents to add contextual notes (e.g., "Cleared every Friday", "Smells hazardous") to a site. | `POST /sites/:id/notes`<br>`GET /sites/:id/notes` |
| **4.3** | **AI Notes Summarizer** | **Dev 2** | Uses LLM to summarize multiple citizen notes into a single actionable briefing for civic authorities. | `services/notes/NoteSummarizer.ts` |
| **4.4** | **User Report History ("My Activity")** | **Dev 1** | Lists all reports, verifications, and cleanup claims submitted by the authenticated user. | `GET /users/me/reports`<br>`GET /users/me/activity` |
| **4.5** | **Photo Abuse & Flagging** | **Dev 1** | Allows reporting misleading or fraudulent images; hides photos with 3+ abuse flags pending moderation. | `POST /photos/:id/flag`<br>`domain/flags/*` |

---

### Phase 5: Cleanliness Scores & Video Scanning

| Step | Feature | Assignee | Description | Endpoints / Artifacts |
| :---: | :--- | :---: | :--- | :--- |
| **5.1** | **Area Cleanliness Scoring Engine** | **Dev 2** | Calculates composite scores (0–100) per Ward and Assembly Seat based on cleanup velocity vs backlog. | `GET /areas/:kind`<br>`GET /areas/:kind/:id/score` |
| **5.2** | **City Ranking Leaderboard** | **Dev 2** | Ranks administrative areas from worst to best, driving civic accountability through transparency. | `GET /rankings/city/:cityId` |
| **5.3** | **Continuous Video Scan Ingestion** | **Dev 1** | Ingests video scan sessions with synchronized GPS tracks recorded during surveys or drives. | `POST /scans/start`<br>`POST /scans/:id/frames` |
| **5.4** | **Social Share Card Generator** | **Dev 2** | Generates dynamic share cards/links for social media (Twitter/WhatsApp) showing before/after site state. | `GET /share/sites/:id`<br>`services/share/*` |

---

## Work Distribution Summary

| Metric | Developer 1 (Dev 1) | Developer 2 (Dev 2) |
| :--- | :--- | :--- |
| **Core Domain** | **Data Ingestion & Spatial Hotspots** | **Civic Intelligence, AI & Scoring** |
| **Key Deliverables** | • Server setup & upload endpoints<br>• Waste report intake<br>• 20m spatial clustering engine<br>• Map hotspots query API<br>• Cleanup claims & 10-backer quorum<br>• User activity & scan tracks | • Database connection & settings<br>• AI microservice client<br>• PII blur & moderation pipeline<br>• Ward & MLA/MP boundary resolution<br>• Formal civic letter generator<br>• Area cleanliness scores & rankings |
| **Shared Contracts** | Coordinates (`GeoPoint`), Site entity (`Site`), Report entity (`Report`) |
| **Prerequisites** | Step 1.1 (Server Scaffold) | Step 1.2 (Settings / Configs) |

---

## Suggested Commit Convention for Both Developers

To keep Git history clean, steady, and easy to review:
* `feat(ingest): add presigned upload URL generator` (Dev 1)
* `feat(ai): connect HTTP client to waste detection microservice` (Dev 2)
* `feat(cluster): implement 20-meter same-spot site merger` (Dev 1)
* `feat(civic): generate formal complaint letters for municipal authorities` (Dev 2)
* `feat(cleanup): add before-and-after cleanup verification pipeline` (Dev 1)
* `feat(scores): add ward cleanliness scoring formulas and leaderboard` (Dev 2)
