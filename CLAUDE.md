# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BYU Scheduler** — a GT Scheduler-style course scheduling web app for BYU students with AI-powered advising. Built for the Weber State AI Hackathon (April 4, 2026).

**Production:** https://byu-scheduler.fly.dev

## Commands

### Backend (from `backend/`)
```bash
go build -o byu-scheduler ./...
./byu-scheduler                      # normal start, loads embeddings from disk
./byu-scheduler --reindex            # rebuild embeddings then start server (~4 min)
./byu-scheduler --reindex-and-exit   # rebuild embeddings then exit (CI/deploy use)
./byu-scheduler --port 8080          # default port is 8000
```

### Frontend (from `frontend/`)
```bash
pnpm dev       # start Vite dev server (localhost:5173)
pnpm build     # tsc + vite build
pnpm lint      # ESLint
pnpm preview   # preview production build
```

### Scrapers (from repo root, run in order)
```bash
pip install -r scraper/requirements.txt
python scraper/scrape_courses.py          # → scraper/output/courses_raw_<yearterm>.json
python scraper/scrape_rmp.py              # → scraper/output/rmp.json
python scraper/merge_data.py --term 20265 # → backend/data/courses.json + rmp.json
```

Yearterm codes: `YYYYT` — T=1 (Winter), 2 (Spring), 3 (Summer), 4 (Fall). Current: `20265` (Fall 2026), `20263` (Spring 2026).

### Fly.io deployment (from `backend/`)
```bash
~/.fly/bin/fly deploy
~/.fly/bin/fly logs --app byu-scheduler
# Rebuild embeddings on production without HTTP downtime:
~/.fly/bin/fly ssh console --app byu-scheduler --command "/app/byu-scheduler --reindex-and-exit"
~/.fly/bin/fly machines restart <machine-id> --app byu-scheduler
```

## Architecture

### Data flow
```
BYU schedule site  → scrape_courses.py  → scraper/output/courses_raw_<yearterm>.json ─┐
RateMyProfessors   → scrape_rmp.py      → scraper/output/rmp.json                     ─┤
                                                                                        ↓
                                           merge_data.py → backend/data/courses.json
                                                         → backend/data/rmp.json
```

`courses.json` and `rmp.json` are loaded fully into memory on server start — no database.
Embedding indexes (`data/embeddings_<yearterm>.json`) are built once with `--reindex` and loaded on subsequent starts. On Fly.io these live on a persistent volume at `/app/data/`.

### API endpoints
All routes under `/api`. Course endpoints require `?term=<yearterm>` (e.g. `?term=20265`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | `{"status":"ok"}` |
| `GET` | `/api/terms` | All available term codes + metadata |
| `GET` | `/api/courses?term=20265[&department=CS]` | Courses for a term, optional dept filter |
| `GET` | `/api/courses/:id?term=20265` | Single course (`CS-235` format, dash not space) |
| `GET` | `/api/professors/:name` | RMP lookup by instructor name (exact then partial match) |
| `POST` | `/api/chat` | SSE streaming AI response (`text/event-stream`) |
| `POST` | `/api/schedule/export?term=20265` | Export selected schedule as JSON; body: `[{courseId, sectionId}]` |

### AI chat flow (`POST /api/chat`)
Request body: `message` + `term` (required); `currentSchedule`, `constraints`, `major`, `completedCourses`, `remainingRequirements` (optional).

1. Embed user query via **Voyage AI** `voyage-3-lite` (512 dims, `input_type: "query"`)
2. Cosine similarity search against `EmbeddingIndex` → top-20 course IDs
3. Build prompt: system prompt (`backend/prompts/schedule_advisor.txt`) + RAG context + user message + schedule/constraints
4. Stream response from **Groq** `llama-3.3-70b-versatile` as SSE events

SSE format: `data: {"type": "text"|"error"|"done", "content": "..."}`

The frontend parses action JSON blocks in the stream to auto-apply schedule changes.

### RAG pipeline (`backend/rag.go`)
- `BuildEmbeddings` — embeds all courses (`input_type: "document"`), saves to `data/embeddings_<yearterm>.json`. 250ms delay between Voyage requests (stays under 300 RPM free tier). 5M token budget cap per run. Exponential backoff on 429s.
- `Retrieve` — cosine similarity, returns top-K course IDs
- `BuildRAGContext` — formats retrieved courses into the context block injected into the LLM prompt

### Frontend components (`frontend/src/`)
- `App.jsx` — root layout, schedule state, React Router (`/` main, `/about` About page)
- `components/ScheduleGrid` — visual weekly calendar of selected courses
- `components/AIChatPanel` — SSE streaming chat, parses action blocks to mutate schedule
- `components/CourseSearch` — search/filter courses by name or department
- `components/SectionDropdown` — select section from multiple offerings
- `components/WorkloadMeter` — total credits + estimated weekly hours
- `components/MajorTrackerPanel` — requirement checklist; props: `requirements[]`, `completedCourses`, `onToggleCompleted`, `onAddCourse`
- `components/ProfessorCard` — RMP rating display card
- `hooks/useCourses` — fetches + filters courses from API
- `hooks/useChat` — manages SSE chat connection
- `lib/api.ts` — API client
- `lib/scheduleUtils.ts` — conflict detection, workload estimation
- `lib/parseDegreeAudit.ts` — parses BYU degree audit PDFs (via `pdfjs-dist`) into `ParsedDegreeAudit`; handles multi-word dept codes and PDF spacing quirks

Right panel has two tabs: **AI Assistant** and **My Progress** (MajorTrackerPanel).

`frontend/public/logo.png` — BYU Cougars logo, used as favicon and header logo. Tab title: "BYU Scheduler".

### Deployment
- Multi-stage Docker build (`golang:1.18-alpine` → `alpine:3.19`), bundles `prompts/` and default data files
- `start.sh` seeds the Fly volume with bundled `courses.json` + `rmp.json` on first boot
- GitHub Actions: `scrape.yml` runs nightly at 3am MT; `deploy.yml` auto-deploys on push to `main` touching `backend/`

## Environment

`backend/.env` (local) / Fly secrets (production):
```
GROQ_API_KEY=...      # Groq llama-3.3-70b-versatile (free)
VOYAGE_API_KEY=...    # Voyage voyage-3-lite embeddings (free tier, requires credit card)
```

## Key data schemas

**`courses.json`** — multi-term, keyed by yearterm (e.g. `"20265"` for Fall 2026, `"20263"` for Spring 2026):
```json
{
  "20265": {
    "term": "Fall 2026",
    "yearterm": "20265",
    "updatedAt": "...",
    "courses": {
      "CS 235": {
        "title": "Data Structures",
        "credits": 3,
        "department": "CS",
        "prerequisites": [],
        "sections": {
          "001": {
            "crn": "10648-000-001",
            "instructor": "Stephens, Thomas E",
            "type": "DAY",
            "meetings": [{"days": ["M","W","F"], "startTime": "09:00", "endTime": "09:50", "location": "TMCB 1170"}],
            "seats": {"capacity": 100, "enrolled": 47, "available": 53},
            "rmp": {"rating": 3.6, "difficulty": 3.0, "wouldTakeAgainPercent": 69.4, "numRatings": 36}
          }
        }
      }
    }
  }
}
```

**`rmp.json`** — keyed by normalized name (`"stephens, thomas"` — lowercase, last-comma-first).

## CORS
Allows `http://localhost:5173`, `http://localhost:3000`, and `*.vercel.app`.
