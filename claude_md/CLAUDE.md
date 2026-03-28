# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BYU Scheduler** — a GT Scheduler-style course scheduling web app for BYU students, built for the Weber State AI Hackathon (April 4, 2026). The backend (this repo) handles data scraping, the Go API server, and Gemini AI integration. A separate teammate owns `frontend/` and `extension/` — do not modify those.

## Commands

### Backend server
```bash
# Build (from backend/)
go build -o byu-scheduler ./...

# Run (from backend/)
./byu-scheduler                    # uses pre-built embeddings
./byu-scheduler --reindex          # rebuilds embedding indexes (slow — hits Gemini API for every course)
./byu-scheduler --port 8080        # default port is 8000
```

### Scrapers (run independently, in order)
```bash
python scraper/scrape_courses.py   # Task 1: BYU class schedule → scraper/output/courses_raw_<yearterm>.json
python scraper/scrape_rmp.py       # Task 2: RateMyProfessors → scraper/output/rmp.json
python scraper/merge_data.py       # Task 3: Merge all → backend/data/courses.json
```

### Validate JSON output
```bash
python -m json.tool < scraper/output/rmp.json
python -m json.tool < backend/data/courses.json
```

### Install scraper dependencies
```bash
pip install -r scraper/requirements.txt
```

## Architecture

### Data flow
```
BYU schedule site → scrape_courses.py → scraper/output/courses_raw_<yearterm>.json ─┐
RateMyProfessors  → scrape_rmp.py    → scraper/output/rmp.json                      ─┤
                                                                                      ↓
                                                         merge_data.py → backend/data/courses.json
```
`courses.json` + `rmp.json` are loaded into memory on server start — no database.
Embedding indexes (`data/embeddings_<yearterm>.json`) are built once with `--reindex` and loaded on subsequent starts.

### API endpoints (`backend/handlers.go`)
All endpoints are under `/api`. Course endpoints require `?term=<yearterm>` (e.g., `?term=20263`).

- `GET /api/terms` — list all available term codes and metadata
- `GET /api/courses?term=20263[&department=CS]` — courses for a term, optional department filter
- `GET /api/courses/:id?term=20263` — single course (`CS-235` format, dash not space)
- `GET /api/professors/:name` — RMP lookup by instructor name (exact then partial match)
- `POST /api/chat` — streams Gemini responses as SSE (`text/event-stream`)

### AI chat flow (`POST /api/chat`)
Request body requires `message` and `term` fields; `currentSchedule` and `constraints` are optional.

1. Embed user query via Gemini `text-embedding-004` API (`RETRIEVAL_QUERY` task type)
2. Retrieve top-20 semantically similar courses from the term's `EmbeddingIndex` (cosine similarity)
3. Build prompt: system prompt + RAG context + user message + current schedule + constraints
4. Stream response from `gemini-2.0-flash` via SSE

SSE format: `data: {"type": "text"|"error"|"done", "content": ...}`

### RAG pipeline (`backend/rag.go`)
- `BuildEmbeddings` — embeds all courses in a term and saves to `data/embeddings_<yearterm>.json`
- `LoadEmbeddings` — loads saved index on startup
- `Retrieve` — cosine similarity search, returns top-K course IDs
- `BuildRAGContext` — formats retrieved courses as the context block injected into the prompt

## Environment

`backend/.env`:
```
GROQ_API_KEY=...      # for chat (llama-3.3-70b-versatile via Groq)
VOYAGE_API_KEY=...    # for embeddings (voyage-3-lite)
```

## Key data schemas

**`courses.json`** (multi-term, frontend contract):
```json
{
  "20263": {
    "term": "Fall 2026",
    "yearterm": "20263",
    "updatedAt": "...",
    "courses": {
      "CS 235": {
        "title": "Data Structures",
        "credits": 3,
        "department": "CS",
        "prerequisites": ["CS 142"],
        "sections": {
          "001": {
            "crn": "12345",
            "instructor": "Smith, John",
            "type": "LEC",
            "meetings": [{"days": ["M","W","F"], "startTime": "10:00", "endTime": "10:50", "location": "TMCB 1170"}],
            "seats": {"capacity": 120, "enrolled": 98, "available": 22},
            "rmp": {"rating": 4.2, "difficulty": 3.1, "wouldTakeAgainPercent": 85, "numRatings": 47}
          }
        }
      }
    }
  }
}
```

**`rmp.json`**: Top-level `professors` key, keyed by normalized name (`"smith, john"` format — lowercase, last-comma-first).

## CORS
Allows `http://localhost:5173`, `http://localhost:3000`, and any `*.vercel.app` subdomain.
