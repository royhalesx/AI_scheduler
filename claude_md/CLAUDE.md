# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BYU Scheduler** — a GT Scheduler-style course scheduling web app for BYU students, built for the Weber State AI Hackathon (April 4, 2026). The backend (this repo) handles data scraping, the Go API server, and AI integration via Groq + Voyage AI. A separate teammate owns `frontend/` and `extension/` — do not modify those.

**Production:** https://byu-scheduler.fly.dev

## Commands

### Backend server
```bash
# Build (from backend/)
go build -o byu-scheduler ./...

# Run (from backend/)
./byu-scheduler                      # normal start, loads embeddings from disk
./byu-scheduler --reindex            # rebuild embeddings then start server (~4 min)
./byu-scheduler --reindex-and-exit   # rebuild embeddings then exit (used by deploy pipeline)
./byu-scheduler --port 8080          # default port is 8000
```

### Scrapers (run from repo root, in order)
```bash
python scraper/scrape_courses.py          # BYU class schedule → scraper/output/courses_raw_<yearterm>.json
python scraper/scrape_rmp.py              # RateMyProfessors → scraper/output/rmp.json
python scraper/merge_data.py --term 20263 # merge → backend/data/courses.json + backend/data/rmp.json
```

### Validate JSON
```bash
python -m json.tool < backend/data/courses.json
python -m json.tool < backend/data/rmp.json
```

### Install scraper dependencies
```bash
pip install -r scraper/requirements.txt
```

### Fly.io deployment
```bash
# Deploy (from backend/)
~/.fly/bin/fly deploy

# Rebuild embeddings on production (~4 min, server keeps serving during this)
~/.fly/bin/fly ssh console --app byu-scheduler --command "/app/byu-scheduler --reindex-and-exit"

# Restart to load new embeddings (~5s downtime)
~/.fly/bin/fly machines restart <machine-id> --app byu-scheduler

# Tail logs
~/.fly/bin/fly logs --app byu-scheduler

# First-time setup (run once)
~/.fly/bin/fly apps create byu-scheduler
~/.fly/bin/fly volumes create byu_scheduler_data --region sjc --size 1 --app byu-scheduler --yes
~/.fly/bin/fly secrets set GROQ_API_KEY=<key> VOYAGE_API_KEY=<key> --app byu-scheduler
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

`courses.json` and `rmp.json` are loaded into memory on server start — no database.
Embedding indexes (`data/embeddings_<yearterm>.json`) are built once with `--reindex` and loaded on subsequent starts. On Fly.io these live on a persistent volume.

### API endpoints (`backend/main.go` routes, `backend/handlers.go` implementations)
All endpoints under `/api`. Course endpoints require `?term=<yearterm>` (e.g. `?term=20263`).

- `GET /api/health` — health check, returns `{"status":"ok"}`
- `GET /api/terms` — list all available term codes and metadata
- `GET /api/courses?term=20263[&department=CS]` — courses for a term, optional department filter
- `GET /api/courses/:id?term=20263` — single course (`CS-235` format, dash not space)
- `GET /api/professors/:name` — RMP lookup by instructor name (exact then partial match)
- `POST /api/chat` — streams AI responses as SSE (`text/event-stream`)

### AI chat flow (`POST /api/chat`)
Request body requires `message` and `term`; `currentSchedule` and `constraints` are optional.

1. Embed user query via **Voyage AI** `voyage-3-lite` (512 dims, `input_type: "query"`)
2. Retrieve top-20 semantically similar courses via cosine similarity against `EmbeddingIndex`
3. Build prompt: system prompt + RAG context + user message + current schedule + constraints
4. Stream response from **Groq** `llama-3.3-70b-versatile` via SSE

SSE format: `data: {"type": "text"|"error"|"done", "content": ...}`

### RAG pipeline (`backend/rag.go`)
- `BuildEmbeddings` — embeds all courses (`input_type: "document"`), saves to `data/embeddings_<yearterm>.json`
  - Token budget cap: aborts if a single run exceeds 5M tokens
  - Retry logic: exponential backoff on 429s (up to 5 attempts)
  - Delay: 250ms between requests (~240 req/min, under Voyage free tier 300 RPM)
- `LoadEmbeddings` — loads saved index on startup
- `Retrieve` — cosine similarity search, returns top-K course IDs
- `BuildRAGContext` — formats retrieved courses as the context block injected into the prompt

### Deployment (`backend/Dockerfile`, `backend/fly.toml`, `backend/start.sh`)
- Multi-stage Docker build: `golang:1.18-alpine` builder → `alpine:3.19` runtime
- `start.sh` seeds the volume with bundled `courses.json` + `rmp.json` on first boot if empty
- Fly.io persistent volume at `/app/data/` — survives deploys
- `--reindex-and-exit` flag allows rebuilding embeddings inside the live container without starting a second HTTP server

## Environment

`backend/.env` (local dev) / Fly secrets (production):
```
GROQ_API_KEY=...      # chat LLM — llama-3.3-70b-versatile via api.groq.com (free)
VOYAGE_API_KEY=...    # embeddings — voyage-3-lite via api.voyageai.com (free tier, needs credit card)
```

## Key data schemas

**`courses.json`** (multi-term, frontend contract):
```json
{
  "20263": {
    "term": "Spring 2026",
    "yearterm": "20263",
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
            "meetings": [{"days": ["M","T","W","Th"], "startTime": null, "endTime": null, "location": "TMCB 1170"}],
            "seats": {"capacity": 100, "enrolled": 47, "available": 53},
            "rmp": {"rating": 3.6, "difficulty": 3.0, "wouldTakeAgainPercent": 69.4, "numRatings": 36}
          }
        }
      }
    }
  }
}
```

**`rmp.json`**: Top-level `professors` key, keyed by normalized name (`"stephens, thomas"` — lowercase, last-comma-first).

## CORS
Allows `http://localhost:5173`, `http://localhost:3000`, and any `*.vercel.app` subdomain.
