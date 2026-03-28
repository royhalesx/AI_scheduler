# BYU Scheduler — Backend

Go API server powering BYU Scheduler, a course planning app for BYU students.

The backend handles three things: scraping BYU course data, serving it via a REST API, and AI-powered schedule advising via Gemini with RAG.

## Setup

```bash
cd backend
cp .env.example .env   # add your GEMINI_API_KEY
go build -o byu-scheduler ./...
```


## API

All endpoints are prefixed with `/api`. Course endpoints require `?term=<yearterm>` (e.g. `?term=20263`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/terms` | List available terms and metadata |
| GET | `/api/courses?term=20263` | All courses for a term; filter with `&department=CS` |
| GET | `/api/courses/:id?term=20263` | Single course (`CS-235` format) |
| GET | `/api/professors/:name` | RMP data for an instructor |
| POST | `/api/chat` | AI schedule advisor (SSE streaming) |

### Chat endpoint

Request:
```json
{
  "message": "Which CS 235 section has the best professor?",
  "term": "20263",
  "currentSchedule": [
    { "courseId": "CS 235", "sectionId": "001" }
  ],
  "constraints": {
    "blockedTimes": [{ "days": ["T", "Th"], "startTime": "08:00", "endTime": "10:00" }],
    "maxCredits": 16,
    "preferredDaysOff": ["F"]
  }
}
```

Streams SSE events:
```
data: {"type": "text", "content": "Based on RMP ratings..."}
data: {"type": "done"}
```

When the AI recommends schedule changes, it appends a JSON action block in the text stream:
```json
{
  "action": "add",
  "courses": [{ "courseId": "CS 235", "sectionId": "002", "reason": "Best RMP rating (4.2)" }]
}
```

## How the AI works

The chat endpoint uses **RAG (Retrieval-Augmented Generation)**:

1. The user's question is embedded into a vector using `gemini-embedding-001`
2. The server finds the 20 most semantically similar courses via cosine similarity against a pre-built index
3. Those courses (with full section/RMP/seat data) are injected into the Gemini prompt as context
4. `gemini-2.0-flash` answers using only the retrieved courses — no hallucinated data

The embedding index is built once with `--reindex` and saved to `data/embeddings_<yearterm>.json`.

## Data pipeline

Run these in order to refresh course data:

```bash
python scraper/scrape_courses.py   # BYU class schedule → scraper/output/courses_raw_<yearterm>.json
python scraper/scrape_rmp.py       # RateMyProfessors → scraper/output/rmp.json
python scraper/merge_data.py       # Merge → backend/data/courses.json
```

Then rebuild embeddings with `./byu-scheduler --reindex`.

## Project structure

```
backend/
├── main.go       # server setup, data loading, routing
├── handlers.go   # API endpoint handlers + Gemini streaming
├── rag.go        # embedding build/load/retrieve pipeline
├── models.go     # data types (Course, Section, ChatRequest, etc.)
├── data/
│   ├── courses.json              # merged course data (frontend contract)
│   └── embeddings_<term>.json   # pre-built RAG index (gitignored)
└── prompts/
    └── schedule_advisor.txt      # Gemini system prompt

scraper/
├── scrape_courses.py   # BYU schedule scraper
├── scrape_rmp.py       # RateMyProfessors scraper
└── merge_data.py       # combines sources into courses.json
```
