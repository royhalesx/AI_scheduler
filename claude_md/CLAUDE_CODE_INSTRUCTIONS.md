# BYU Scheduler — Person A (Backend + Data + AI) Claude Code Instructions

You are helping Ben build the backend, data pipeline, and AI integration for **BYU Scheduler** — a GT Scheduler-style course scheduling app for BYU students. This is for the Weber State AI Hackathon on April 4, 2026.

## Project Context

BYU Scheduler is a web app (+ Chrome extension) that lets BYU students visually plan their class schedules with integrated professor ratings and an AI-powered academic advisor. Think GT Scheduler (`gt-scheduler.org`) but for BYU, with Claude as the AI brain.

A separate teammate (Person B) is building the React frontend and Chrome extension. **Your job is everything behind the API boundary:** scraping data, building the API server, and wiring up Claude.

## Repo Structure

```
byu-scheduler/
├── backend/
│   ├── server.py                # FastAPI app
│   ├── prompts/
│   │   └── schedule_advisor.txt # Claude system prompt
│   ├── data/
│   │   ├── courses.json         # final merged output
│   │   ├── rmp.json             # raw RMP cache
│   │   └── prerequisites.json   # prerequisite mappings
│   └── requirements.txt
├── scraper/
│   ├── scrape_courses.py        # BYU class schedule scraper
│   ├── scrape_rmp.py            # RateMyProfessors scraper
│   ├── scrape_prereqs.py        # BYU catalog prerequisite scraper
│   └── merge_data.py            # combine all sources into courses.json
├── frontend/                    # Person B owns — don't touch
├── extension/                   # Person B owns — don't touch
└── README.md
```

## Task Sequence

Complete these in order. Each task should be a working, testable unit.

---

### Task 1: Scrape BYU Course Data

**Goal:** Produce a JSON file containing all BYU courses with sections, times, instructors, and locations for the current/upcoming term.

**Source:** `https://commtech.byu.edu/noauth/classSchedule/index.php`

This is BYU's public (no-auth-required) class schedule search. It supports searching by department, course number, time, etc. Inspect the page to understand how it makes requests — it likely uses form POSTs or AJAX calls to return HTML tables of results.

**Approach:**
1. First, manually explore the site to understand the request/response pattern. Use browser dev tools or `curl` to see what parameters it accepts.
2. Get a list of all BYU department codes (e.g., CS, MATH, ECEN, ACC, etc.). These may be in a dropdown on the search page.
3. Iterate over each department, scrape all courses and their sections for the target term (Fall 2026, or Spring/Summer 2026 if Fall isn't posted yet).
4. For each section, extract: course ID (e.g., "CS 235"), course title, section number, CRN, instructor name, meeting days, start time, end time, location/building, seat capacity, enrolled count, available seats.
5. Use `requests` + `BeautifulSoup` (or `httpx` + `selectolax` for speed). Add polite delays between requests (0.5–1s).
6. Handle edge cases: TBA times, online/async sections, labs/recitations linked to lectures, cross-listed courses.

**Output:** `scraper/output/courses_raw.json`

```json
{
  "term": "Fall 2026",
  "scrapedAt": "2026-03-30T15:00:00Z",
  "departments": ["CS", "MATH", "ECEN", ...],
  "courses": {
    "CS 235": {
      "title": "Data Structures",
      "credits": 3,
      "department": "CS",
      "sections": {
        "001": {
          "crn": "12345",
          "instructor": "Smith, John",
          "type": "LEC",
          "meetings": [
            {
              "days": ["M", "W", "F"],
              "startTime": "10:00",
              "endTime": "10:50",
              "location": "TMCB 1170"
            }
          ],
          "seats": {
            "capacity": 120,
            "enrolled": 98,
            "available": 22
          }
        },
        "002": { ... }
      }
    }
  }
}
```

**Validation:** Print summary stats — total departments scraped, total courses, total sections, any courses with 0 sections or missing fields.

**If scraping is blocked or too difficult:** Fall back to scraping a subset of key departments manually (CS, MATH, ECEN, STAT, PHYS, CHEM, ENGL, REL A, HIST, ECON — roughly 10 departments). Or look for any BYU API endpoints in the network tab that return JSON directly. Also check if `catalog.byu.edu` (powered by Coursedog) has a more accessible API.

---

### Task 2: Scrape RateMyProfessors Data

**Goal:** Get professor ratings for all BYU instructors and match them to course sections.

**Source:** RateMyProfessors GraphQL API

**RMP GraphQL Details:**
- Endpoint: `https://www.ratemyprofessors.com/graphql`
- BYU's school ID (base64): `U2Nob29sLTEzNQ==` (which decodes to `School-135`)
- You need to send a POST with a query that searches for professors at this school
- Required header: `Authorization: Basic dGVzdDp0ZXN0` (this is the public auth token `test:test`)

**Sample GraphQL query to search professors by school:**
```graphql
query NewSearchTeachersQuery($schoolID: ID!, $cursor: String) {
  newSearch {
    teachers(query: { schoolID: $schoolID }, first: 100, after: $cursor) {
      edges {
        node {
          id
          firstName
          lastName
          avgRating
          avgDifficulty
          wouldTakeAgainPercent
          numRatings
          department
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

**Approach:**
1. Paginate through all BYU professors using the cursor-based pagination.
2. Store as a lookup dict keyed by normalized name (e.g., "smith, john" → lowercase, stripped).
3. Match to course instructors from Task 1 using fuzzy matching (last name + first initial at minimum, since BYU schedule might show "Smith, J." while RMP has "John Smith").

**Output:** `scraper/output/rmp.json`

```json
{
  "smith, john": {
    "rmpId": "abc123",
    "firstName": "John",
    "lastName": "Smith",
    "rating": 4.2,
    "difficulty": 3.1,
    "wouldTakeAgainPercent": 85,
    "numRatings": 47,
    "department": "Computer Science"
  }
}
```

**If the GraphQL API has changed or is blocked:** Use the RMP search page directly — `https://www.ratemyprofessors.com/search/professors/135?q=*` — and scrape from there.

---

### Task 3: Scrape Prerequisites

**Goal:** Build a prerequisite graph for BYU courses so the AI advisor can recommend courses students are actually eligible for.

**Source:** `https://catalog.byu.edu/courses` (BYU Catalog, powered by Coursedog)

**Approach:**
1. Inspect the catalog page for API calls. Coursedog-powered catalogs often have a REST or GraphQL API under the hood (check network tab for `api.coursedog.com` or similar).
2. For each course, extract the prerequisite string (e.g., "CS 142 with a minimum grade of C" or "MATH 112 and MATH 113").
3. Parse prerequisite strings into a structured format. Most are simple AND/OR trees.
4. Focus on the 10–15 most popular departments first. Don't try to scrape every course at BYU.

**Output:** `scraper/output/prerequisites.json`

```json
{
  "CS 235": {
    "prerequisites": ["CS 142"],
    "rawText": "C S 142 with a minimum grade of C-"
  },
  "CS 312": {
    "prerequisites": ["CS 235", "MATH 290"],
    "rawText": "C S 235 and MATH 290"
  }
}
```

**If this is too hard to automate:** Manually compile prerequisites for CS, MATH, ECEN, and STAT courses. That's enough for a compelling demo. The AI can still advise on other courses using its general knowledge — just won't have structured prereq data.

---

### Task 4: Merge All Data

**Goal:** Combine courses, RMP data, and prerequisites into a single `courses.json` that the frontend consumes.

**Script:** `scraper/merge_data.py`

**Logic:**
1. Load `courses_raw.json`, `rmp.json`, `prerequisites.json`
2. For each course section, match instructor name to RMP data and embed it
3. For each course, attach prerequisite info
4. Output final `backend/data/courses.json`

**Final schema (this is the contract with the frontend):**

```json
{
  "term": "Fall 2026",
  "updatedAt": "2026-04-03T12:00:00Z",
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
          "meetings": [
            {
              "days": ["M", "W", "F"],
              "startTime": "10:00",
              "endTime": "10:50",
              "location": "TMCB 1170"
            }
          ],
          "seats": {
            "capacity": 120,
            "enrolled": 98,
            "available": 22
          },
          "rmp": {
            "rating": 4.2,
            "difficulty": 3.1,
            "wouldTakeAgainPercent": 85,
            "numRatings": 47
          }
        }
      }
    }
  }
}
```

**Validation:** Run a check that counts: total courses, courses with RMP matches, courses with prereq data, sections with complete meeting times. Print a coverage report.

---

### Task 5: Build the Claude System Prompt

**Goal:** Craft a system prompt that makes Claude an expert BYU academic schedule advisor.

**File:** `backend/prompts/schedule_advisor.txt`

**The prompt should instruct Claude to:**

1. **Role:** You are an AI academic advisor for BYU students. You help them build optimal class schedules by reasoning about course times, professor quality, workload, and prerequisites.

2. **Input context:** Each request will include:
   - The student's message (natural language)
   - Their current schedule (list of selected course sections, if any)
   - Their constraints (blocked time slots, preferred days off, max credits, etc.)
   - Available course data (injected as JSON or summarized)

3. **Capabilities:**
   - Suggest courses based on major, year, and interests
   - Find non-conflicting schedule combinations
   - Recommend professors based on RMP data (prefer higher ratings, note difficulty)
   - Warn about prerequisite issues
   - Respect time constraints ("no classes before 10am", "Tuesdays off for my internship")
   - Estimate workload and flag overloaded schedules (18+ credits, multiple hard courses)
   - Answer general BYU academic questions

4. **Response format:** Respond conversationally but include structured data when modifying a schedule. When suggesting schedule changes, include a JSON block in this format:

```json
{
  "action": "add" | "remove" | "swap" | "suggest_schedule",
  "courses": [
    {
      "courseId": "CS 235",
      "sectionId": "001",
      "reason": "Best professor rating (4.2) and fits your MWF preference"
    }
  ]
}
```

5. **Personality:** Helpful, direct, knowledgeable. Sound like a smart upperclassman who's taken these classes, not a corporate chatbot. Keep responses concise — students want answers, not essays.

6. **Guardrails:**
   - If you don't have data for a course, say so honestly
   - Don't make up professor ratings or prerequisites
   - If a schedule is impossible (conflicts everywhere), explain why and suggest alternatives

**Test the prompt** with these sample queries:
- "I'm a CS sophomore. What should I take next fall?"
- "Add CS 312 to my schedule but I can't do anything before 10am"
- "Which CS 235 section has the best professor?"
- "I have 18 credits planned — is that too much?"
- "Build me a schedule with CS 252, MATH 313, REL A 275, and an easy GE. No classes on Friday."

Iterate until the responses are good. Save the best version.

---

### Task 6: Build the FastAPI Server

**Goal:** Three-endpoint API that serves course data and proxies AI chat.

**File:** `backend/server.py`

**Dependencies:** `fastapi`, `uvicorn`, `anthropic`, `python-dotenv`

**Requirements file:** `backend/requirements.txt`
```
fastapi
uvicorn
anthropic
python-dotenv
```

**Environment variables** (`.env` in `backend/`):
```
ANTHROPIC_API_KEY=sk-ant-...
```

**Endpoints:**

#### `GET /api/courses`
- Returns the full `courses.json`
- Add `Cache-Control: public, max-age=3600` header
- Optional query params: `?department=CS` to filter

#### `GET /api/courses/{course_id}`
- Returns a single course with all its sections
- `course_id` format: `CS-235` (use dash instead of space for URL safety)
- 404 if not found

#### `POST /api/chat`
- Request body:
```json
{
  "message": "Build me a schedule with CS 235 and MATH 313",
  "currentSchedule": [
    { "courseId": "ENGL 150", "sectionId": "003" }
  ],
  "constraints": {
    "blockedTimes": [
      { "days": ["T", "Th"], "startTime": "08:00", "endTime": "10:00" }
    ],
    "maxCredits": 16,
    "preferredDaysOff": ["F"]
  }
}
```

- **Implementation:**
  1. Load the system prompt from `prompts/schedule_advisor.txt`
  2. Build the user message by combining their text message with their current schedule and constraints as context
  3. Include relevant course data in the prompt (filter to mentioned courses + related courses in the same departments — don't dump all 5000 courses)
  4. Call Claude API (`claude-sonnet-4-20250514`) with streaming
  5. Return the streamed response to the frontend

- **Streaming:** Use FastAPI's `StreamingResponse` with `text/event-stream` content type. The frontend will use `EventSource` or `fetch` with a reader to display tokens as they arrive.

- Response format (SSE):
```
data: {"type": "text", "content": "Based on your preferences, "}
data: {"type": "text", "content": "I'd recommend..."}
data: {"type": "schedule", "content": {"action": "suggest_schedule", "courses": [...]}}
data: {"type": "done"}
```

#### `GET /api/professors/{name}`
- Lookup by instructor name (URL-encoded)
- Returns RMP data for that professor
- Used by the Chrome extension and professor cards

**CORS:** Allow origins `http://localhost:5173` (Vite dev) and the production Vercel URL.

**Error handling:** Return proper HTTP status codes and JSON error messages. Never expose stack traces.

---

### Task 7: Host Static Data on GitHub Pages

**Goal:** Publish `courses.json` to GitHub Pages so the frontend has a zero-dependency fallback.

**Approach:**
1. Create a `gh-pages` branch (or use GitHub Actions)
2. Push `backend/data/courses.json` to the root of that branch
3. It'll be accessible at `https://<username>.github.io/byu-scheduler/courses.json`
4. Frontend loads from this URL if the API is down

This takes 10 minutes. Do it once the data is stable.

---

### Task 8: Deploy API

**Goal:** Get the FastAPI server running on a public URL.

**Options (pick one):**
- **Railway** — `railway up` from `backend/` directory. Free tier. Set env vars in dashboard.
- **Render** — connect repo, set build command to `pip install -r requirements.txt`, start command to `uvicorn server:app --host 0.0.0.0 --port $PORT`.
- **Fly.io** — `fly launch` from `backend/`. Generous free tier.

**Verify:** `curl https://your-api.railway.app/api/courses | jq '.courses | keys | length'` should return the number of courses.

---

## Technical Decisions

- **Python over Go for backend:** Faster to iterate at a hackathon. Anthropic's Python SDK is first-class. FastAPI gives you automatic OpenAPI docs for free.
- **Static JSON over database:** No need for Postgres/SQLite for a hackathon. Course data changes once per term. Load it into memory on server start.
- **Streaming over request/response for chat:** Judges will see tokens appearing in real-time. This looks dramatically better in a demo than a loading spinner followed by a wall of text.
- **Sonnet over Opus for Claude:** Faster responses, cheaper, good enough for schedule reasoning. Use `claude-sonnet-4-20250514`.

## Quality Bar

- Every script should be runnable with a single command (e.g., `python scraper/scrape_courses.py`)
- Every script should print progress and a summary at the end
- All data files should be valid JSON (test with `python -m json.tool < file.json`)
- The API should start with `uvicorn backend.server:app --reload` and work immediately
- Include a `README.md` in each directory explaining what it does and how to run it
