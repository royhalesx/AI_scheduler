# BYU Scheduler

> AI-powered course scheduling that knows your degree, your professors, and your time — so you can build the perfect semester in one conversation.

Built for the **Weber State AI Hackathon (April 4, 2026)** by [Ben Jensen](https://github.com/jenbensen17) and [Roy Hales](https://github.com/royhalesx).

**Live:** [byu-scheduler.vercel.app](https://byu-scheduler.vercel.app) · Backend: [byu-scheduler.fly.dev](https://byu-scheduler.fly.dev)

---

## What it does

BYU Scheduler replaces the four-tab registration ritual — class search, RateMyProfessors, degree audit PDF, conflict spreadsheet — with a single interface.

- **AI schedule generation** — describe what you want, get a conflict-free, requirement-satisfying schedule built from live course data
- **Degree audit upload** — drag in your BYU PDF and the app parses every major and GE requirement automatically
- **RAG-grounded chat** — the assistant only recommends courses that actually exist this term, in sections that are open
- **Weekly grid** — visual calendar with drag-to-block unavailable times, course popups with RMP stats, and conflict highlighting
- **Workload estimator** — contact-hours-based load estimate weighted by course level and professor difficulty
- **iCal export** — download your schedule directly to Apple Calendar or Google Calendar

---

## How it works

```
BYU schedule site  ──► scrape_courses.py ──┐
RateMyProfessors   ──► scrape_rmp.py      ──┼──► merge_data.py ──► courses.json + rmp.json
                                            ┘                             │
                                                                          ▼
                                                               Go API loads into memory
                                                                          │
                                                               Voyage AI embeds every section
                                                               (voyage-3-lite, 512 dims)
                                                                          │
                              Student question ──► embed query ──► cosine similarity
                                                                          │
                                                               top-20 courses injected into prompt
                                                                          │
                                                               Gemini 2.5 Flash streams response
                                                                          │
                                                               SSE ──► React frontend
                                                                          │
                                                               Action JSON ──► schedule mutations
```

### AI action blocks

When the model recommends changes, it emits a structured JSON block inside its response. The frontend strips it from the displayed text and applies it to schedule state:

```json
{
  "action": "suggest_schedule",
  "courses": [
    { "courseId": "CS 235", "sectionId": "001", "reason": "Best RMP rating (3.6/5)" },
    { "courseId": "MATH 341", "sectionId": "002", "reason": "Fulfills major requirement" }
  ]
}
```

---

## Stack

| Layer | Technology |
|---|---|
| **Backend** | Go 1.18, Gin |
| **AI** | Google Gemini 2.5 Flash (streaming SSE) |
| **Embeddings** | Voyage AI `voyage-3-lite` — top-20 RAG retrieval |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS |
| **Data** | Python scrapers (BYU class schedule + RateMyProfessors) |
| **Frontend hosting** | Vercel |
| **Backend hosting** | Fly.io (persistent volume for embedding indexes) |
| **CI/CD** | GitHub Actions — nightly scrape + auto-deploy on push |

---

## Local setup

### Backend

```bash
cd backend
cp .env.example .env   # add GEMINI_API_KEY and VOYAGE_API_KEY

go build -o byu-scheduler ./...

# First run — build the semantic search index (~4 min, calls Voyage API)
./byu-scheduler --reindex

# Subsequent runs — loads index from disk (~1s startup)
./byu-scheduler
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev   # http://localhost:5173
```

### Data pipeline (optional — data already checked in)

```bash
# Run from repo root, in order:
pip install -r scraper/requirements.txt
python scraper/scrape_courses.py          # → scraper/output/courses_raw_<yearterm>.json
python scraper/scrape_rmp.py              # → scraper/output/rmp.json
python scraper/merge_data.py --term 20265 # → backend/data/courses.json + rmp.json

# Rebuild embeddings after data update
cd backend && ./byu-scheduler --reindex
```

**Yearterm codes:** `YYYYT` — T=1 (Winter), T=2 (Spring), T=3 (Summer), T=4 (Fall).  
Current terms: `20265` (Fall 2026), `20263` (Spring 2026).

---

## API

All routes under `/api`. Course endpoints require `?term=<yearterm>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | `{"status":"ok"}` |
| `GET` | `/api/terms` | All available terms and metadata |
| `GET` | `/api/courses?term=20265` | All courses for a term; filter with `&department=CS` |
| `GET` | `/api/courses/:id?term=20265` | Single course — use `CS-235` format (dash, not space) |
| `GET` | `/api/professors/:name` | RMP data for an instructor |
| `POST` | `/api/chat` | AI schedule advisor — SSE streaming |
| `POST` | `/api/schedule/export?term=20265` | Hydrate a list of `{courseId, sectionId}` into full course objects |

### Chat request

```json
{
  "message": "Build me a schedule for this term",
  "term": "20265",
  "currentSchedule": [{ "courseId": "CS 235", "sectionId": "001" }],
  "constraints": {
    "blockedTimes": [{ "days": ["T", "Th"], "startTime": "08:00", "endTime": "10:00" }],
    "maxCredits": 16
  },
  "major": "Computer Science",
  "completedCourses": ["CS 111", "CS 235"],
  "remainingRequirements": ["CS 236", "CS 240", "CS 312"]
}
```

`message` and `term` are required. All other fields are optional context injected into the AI prompt.

### Chat SSE response

```
data: {"type": "text", "content": "Here's a schedule that fits your requirements..."}
data: {"type": "done"}
```

---

## Deployment

### Frontend (Vercel)

```bash
cd frontend
npm install -g vercel   # once per machine
vercel login            # once per machine
vercel --prod           # deploy to production
```

The project is already linked via `frontend/.vercel/`. `vercel --prod` runs `tsc + vite build` and pushes to Vercel's CDN.

### Backend (Fly.io)

```bash
cd backend

# Deploy
~/.fly/bin/fly deploy

# Rebuild embeddings on production (no downtime, ~4 min)
~/.fly/bin/fly ssh console --app byu-scheduler --command "/app/byu-scheduler --reindex-and-exit"
~/.fly/bin/fly machines restart <machine-id> --app byu-scheduler

# Tail logs
~/.fly/bin/fly logs --app byu-scheduler
```

**Fly secrets required:**
```
GEMINI_API_KEY    # Google Gemini 2.5 Flash
VOYAGE_API_KEY    # Voyage AI voyage-3-lite embeddings
```

The backend runs on a single `shared-cpu-1x` 256MB machine with a 1GB persistent volume at `/app/data/` for courses, RMP data, and embedding indexes. On first boot, `start.sh` seeds the volume with the data bundled into the Docker image.

---

## Project structure

```
backend/
├── main.go          # startup, data loading, routing, CORS
├── handlers.go      # all API handlers + Gemini SSE streaming
├── rag.go           # Voyage embedding build/load/retrieve pipeline
├── models.go        # data types
├── Dockerfile       # multi-stage build (golang:1.18-alpine → alpine:3.19)
├── fly.toml         # Fly.io config
├── start.sh         # seeds volume on first boot
├── data/
│   ├── courses.json              # merged course + RMP data (all terms)
│   ├── rmp.json                  # professor ratings
│   └── embeddings_<term>.json   # RAG index (gitignored, lives on Fly volume)
└── prompts/
    └── schedule_advisor.txt      # LLM system prompt

frontend/src/
├── pages/
│   ├── SchedulerHome.jsx    # main scheduling UI, all schedule state
│   └── AboutPage.jsx        # static about + team credits
├── components/
│   ├── ScheduleGrid         # visual weekly calendar with course popups
│   ├── AIChatPanel          # SSE streaming chat, applies action blocks
│   ├── CourseSearch         # search/filter courses by name or department
│   ├── SectionPicker        # section selection modal
│   ├── WorkloadMeter        # credit + estimated hours display
│   └── MajorTrackerPanel    # requirement checklist with PDF upload
├── hooks/
│   ├── useCourses            # fetches + filters courses from API
│   └── useChat               # SSE connection, localStorage, action parsing
└── lib/
    ├── api.ts                # API client
    ├── scheduleUtils.ts      # conflict detection, workload estimation
    ├── parseDegreeAudit.ts   # BYU degree audit PDF parser
    └── geRequirements.ts     # static BYU GE requirement definitions

scraper/
├── scrape_courses.py   # BYU class schedule scraper
├── scrape_rmp.py       # RateMyProfessors scraper
└── merge_data.py       # merges all sources → backend/data/

extension/              # Chrome extension (work in progress)

.github/workflows/
├── scrape.yml          # nightly scrape at 3am MT
└── deploy.yml          # auto-deploy backend on push to main
```

---

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Backend | Google Gemini 2.5 Flash — chat LLM |
| `VOYAGE_API_KEY` | Backend | Voyage AI — document + query embeddings |

Copy `backend/.env.example` to `backend/.env` for local development.
