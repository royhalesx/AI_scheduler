# BYU Scheduler

GT Scheduler-style course planning app for BYU students with AI-powered advising. Built for the Weber State AI Hackathon (April 4, 2026).

**Creators:** [Ben Jensen](https://github.com/jenbensen17) · [Roy Hales](https://github.com/royhalesx)

**Production URL:** https://byu-scheduler.fly.dev

---

## How it works

### Full data flow
```
BYU schedule site  → scrape_courses.py  → scraper/output/courses_raw_<yearterm>.json ─┐
RateMyProfessors   → scrape_rmp.py      → scraper/output/rmp.json                     ─┤
                                                                                        ↓
                                           merge_data.py → backend/data/courses.json
                                                         → backend/data/rmp.json
```

On server startup, `courses.json` and `rmp.json` are loaded fully into memory — no database.

### AI chat pipeline (POST /api/chat)
```
Student question
      ↓
Voyage AI (voyage-3-lite)
  → embeds question into 512-dim vector
      ↓
Cosine similarity search against pre-built index
  → top 20 most relevant courses retrieved
      ↓
Groq (llama-3.3-70b-versatile)
  → streams response using only retrieved courses as context
      ↓
SSE stream → frontend
```

The embedding index (`data/embeddings_<yearterm>.json`) is built once with `--reindex` and persists on the Fly.io volume. It's rebuilt nightly after new course data arrives.

---

## Local setup

```bash
cd backend
cp .env.example .env      # fill in GROQ_API_KEY and VOYAGE_API_KEY
go build -o byu-scheduler ./...

# First run — build the semantic search index (~4 min, calls Voyage API)
./byu-scheduler --reindex

# Subsequent runs — loads index from disk (~1s startup)
./byu-scheduler
```

**Dependencies:** Go 1.18+, a [Groq API key](https://console.groq.com) (free), a [Voyage AI key](https://www.voyageai.com) (free with credit card on file).

---

## API

All endpoints are prefixed with `/api`. Course endpoints require `?term=<yearterm>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check — returns `{"status":"ok"}` |
| GET | `/api/terms` | All available terms and metadata |
| GET | `/api/courses?term=20265` | All courses for a term; filter with `&department=CS` |
| GET | `/api/courses/:id?term=20265` | Single course — use `CS-235` format (dash, not space) |
| GET | `/api/professors/:name` | RMP data for an instructor |
| POST | `/api/chat` | AI schedule advisor — SSE streaming |
| POST | `/api/schedule/export?term=20265` | Export built schedule as JSON |

### Chat request body
```json
{
  "message": "Which CS 235 section has the best professor?",
  "term": "20265",
  "currentSchedule": [
    { "courseId": "CS 235", "sectionId": "001" }
  ],
  "constraints": {
    "blockedTimes": [{ "days": ["T", "Th"], "startTime": "08:00", "endTime": "10:00" }],
    "maxCredits": 16,
    "preferredDaysOff": ["F"]
  },
  "major": "Computer Science",
  "completedCourses": ["CS 111", "CS 235"],
  "remainingRequirements": ["CS 236", "CS 240", "CS 312"]
}
```

`message` and `term` are required. All other fields are optional. `major`, `completedCourses`, and `remainingRequirements` are injected into the AI prompt to prevent re-suggesting completed courses and to prioritize graduation requirements.

### Schedule export request body
```json
[
  { "courseId": "CS 235", "sectionId": "001" },
  { "courseId": "MATH 112", "sectionId": "002" }
]
```

Returns an array of `ExportedCourse` objects with `courseId`, `courseName`, `section`, `crn`, `instructor`, `credits`, and `meetings`.

### Chat SSE response
```
data: {"type": "text", "content": "Stephens, Thomas E has the best..."}
data: {"type": "text", "content": " rating at 3.6/5."}
data: {"type": "done"}
```

When the AI recommends schedule changes, a JSON action block is embedded in the text stream:
```json
{
  "action": "add" | "remove" | "swap" | "suggest_schedule",
  "courses": [
    { "courseId": "CS 235", "sectionId": "001", "reason": "Best RMP rating (3.6/5)" }
  ]
}
```

---

## Data pipeline

```bash
# Run from repo root, in order:
python scraper/scrape_courses.py          # scrapes BYU class schedule (all terms)
python scraper/scrape_rmp.py              # scrapes RateMyProfessors
python scraper/merge_data.py --term 20265 # merges everything into backend/data/
```

Yearterm codes: `YYYYT` where T=1 (Winter), 2 (Spring), 3 (Summer), 4 (Fall). Current terms: `20265` (Fall 2026), `20263` (Spring 2026).

After updating data, rebuild the embedding index:
```bash
cd backend && ./byu-scheduler --reindex
```

---

## Deployment (Fly.io)

The app runs at `byu-scheduler.fly.dev` on a single shared-cpu-1x 256MB machine with a 1GB persistent volume at `/app/data/` for courses, RMP data, and embeddings.

### Environment variables (set as Fly secrets)
```
GROQ_API_KEY      # chat LLM (llama-3.3-70b-versatile)
VOYAGE_API_KEY    # embeddings (voyage-3-lite)
```

### Useful commands
```bash
# Deploy
cd backend && ~/.fly/bin/fly deploy

# Rebuild embeddings on production (runs inside live container, ~4 min)
~/.fly/bin/fly ssh console --app byu-scheduler --command "/app/byu-scheduler --reindex-and-exit"

# Restart to load new embeddings
~/.fly/bin/fly machines restart <machine-id> --app byu-scheduler

# Tail logs
~/.fly/bin/fly logs --app byu-scheduler

# SSH into container
~/.fly/bin/fly ssh console --app byu-scheduler
```

### First-time setup
```bash
~/.fly/bin/fly auth login
~/.fly/bin/fly apps create byu-scheduler
~/.fly/bin/fly volumes create byu_scheduler_data --region sjc --size 1 --app byu-scheduler --yes
~/.fly/bin/fly secrets set GROQ_API_KEY=<key> VOYAGE_API_KEY=<key> --app byu-scheduler
cd backend && ~/.fly/bin/fly deploy
# After first deploy, build initial embeddings:
~/.fly/bin/fly ssh console --app byu-scheduler --command "/app/byu-scheduler --reindex-and-exit"
~/.fly/bin/fly machines restart <machine-id> --app byu-scheduler
```

### First-boot behavior
On initial deploy the volume is empty. `start.sh` detects this and seeds `courses.json` and `rmp.json` from defaults bundled into the Docker image. Embeddings are then built via `--reindex-and-exit`.

---

## Project structure

```
backend/
├── main.go         # startup, data loading, routing, CORS
├── handlers.go     # all API handlers + Groq SSE streaming + schedule export
├── rag.go          # Voyage embedding build/load/retrieve pipeline
├── models.go       # all data types
├── Dockerfile      # multi-stage build (golang:1.18-alpine → alpine:3.19)
├── fly.toml        # Fly.io config — region, volume mount, health check
├── start.sh        # container entrypoint — seeds volume on first boot
├── data/
│   ├── courses.json              # merged course + RMP data (all terms)
│   ├── rmp.json                  # professor ratings
│   └── embeddings_<term>.json   # RAG index (gitignored, lives on Fly volume)
└── prompts/
    └── schedule_advisor.txt      # LLM system prompt

frontend/
├── src/
│   ├── App.jsx                   # root layout, schedule state, React Router
│   ├── components/
│   │   ├── ScheduleGrid          # visual weekly calendar
│   │   ├── AIChatPanel           # SSE streaming chat, parses action blocks
│   │   ├── CourseSearch          # search/filter courses
│   │   ├── SectionPicker         # section selection modal
│   │   ├── WorkloadMeter         # credit + hour totals
│   │   └── MajorTrackerPanel     # requirement checklist (requirements[] prop)
│   ├── hooks/
│   │   ├── useCourses            # fetches + filters courses from API
│   │   └── useChat               # manages SSE chat connection
│   └── lib/
│       ├── api.ts                # API client
│       └── scheduleUtils.ts      # conflict detection, workload estimation
└── public/
    └── logo.png                  # BYU Cougars logo (favicon + header)

scraper/
├── scrape_courses.py   # BYU class schedule scraper
├── scrape_rmp.py       # RateMyProfessors scraper
└── merge_data.py       # merges all sources → backend/data/

.github/workflows/
└── scrape.yml          # nightly scrape at 3am MT; commits updated data
```

---

## CORS

Allows `http://localhost:5173`, `http://localhost:3000`, and any `*.vercel.app` subdomain.
