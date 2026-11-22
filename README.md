# EcoTrace

**AI-Powered Environmental Tracking & Civic Waste Action**

EcoTrace empowers communities and civic authorities to detect, track, and resolve environmental waste hotspots through computer vision, automated classification, and verified reporting.

**See [CHECKLIST.md](./CHECKLIST.md) for what is done and what remains.**

## Run locally

```bash
# 1. Database: use the hosted Supabase project (credentials in backend/.env, gitignored)
cd backend && npm install && npm run db:setup

# 2. AI microservice — port 8100 (Gemini key in microservice/.env)
cd ../microservice
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn main:app --host 127.0.0.1 --port 8100

# 3. Backend API — port 8000
cd ../backend && npm run dev

# 4. Frontend — port 5173 (use dev:https for phone camera/GPS)
cd ../frontend && npm install && npm run dev
```

---

## Architecture & Team Modules

| Directory | Module / Role | Focus Area |
| :--- | :--- | :--- |
| `frontend/` | **Frontend Application** | Interactive map, camera capture, user dashboard, reporting interface |
| `backend/` | **Core Server & APIs** | Business logic, user authentication, data persistence, API routing |
| `microservice/` | **AI/ML Service** | Computer vision, waste classification models, verification inference |
| `testing/` | **Quality Assurance** | Integration tests, end-to-end validation, scenario testing |

---

## Development Workflow

1. **Primary Integration Branch**: All feature development branches off `staging`.
2. **Branch Naming**:
   - `frontend/<feature-name>`
   - `backend/<feature-name>`
   - `microservice/<feature-name>`
   - `testing/<feature-name>`
3. **Commit Standard**: Write clear, descriptive commits (e.g. `feat: ...`, `fix: ...`, `test: ...`).
4. **Integration**: Pull requests are reviewed and merged into `staging`, then promoted to `main`.

---

## Getting Started

Refer to each module's respective directory for specific setup instructions as development progresses.
