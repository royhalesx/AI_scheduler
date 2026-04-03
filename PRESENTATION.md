# BYU Scheduler — Presentation Script
**Weber State AI Hackathon · 2 min demo + 1 min Q&A**

---

## About the project

### What inspired us

Course registration is a **combinatorial mess**: sections, overlapping meetings, professor quality, credit load, and degree rules live in different systems. We kept thinking, *“There should be one place where I can see my week, my requirements, and ask something intelligent about tradeoffs.”* Tools like GT Scheduler proved the idea for another school; we wanted that experience for **BYU**, with **real catalog data** and an **AI layer** that actually respects what’s offered this term—not generic advice from a model that’s never seen the schedule.

### What we learned

- **Retrieval-augmented generation isn’t optional** for this problem. Without embeddings over the live catalog, an LLM will invent courses or sections. We learned to treat the model as a *reasoning layer* on top of a *search layer* (Voyage embeddings + cosine similarity), not as the source of truth.
- **Streaming UX matters.** Server-sent events for chat made the assistant feel responsive and made it obvious the system was doing real work, not returning canned text.
- **Structured outputs beat prose-only.** Teaching the model to emit a small JSON “action” block—add/swap/remove sections—let us connect language to UI state safely.
- **PDFs are “data” too.** Degree audits look structured until you parse them; we learned a lot about normalizing course IDs, nested requirement trees, and edge cases in university PDFs.
- **End-to-end shipping teaches deployment.** CORS, env secrets, embedding indexes on a volume, and separate frontend/backend hosts (Vercel + Fly.io) were as much part of the project as the React components.

### How we built it

| Layer | What we used |
|--------|----------------|
| **Data** | Python scrapers for BYU’s schedule and RateMyProfessors; a merge step produces JSON the API loads at startup. |
| **Backend** | Go (Gin): REST for courses, terms, professors; `POST /api/chat` streams SSE; RAG builds context from a precomputed embedding index per term. |
| **AI** | Voyage AI (`voyage-3-lite`) for document/query embeddings; Cerebras (Llama 3.3 70B) for the advisor, with a system prompt plus retrieved course context. |
| **Frontend** | React + Vite + TypeScript pieces: weekly grid, search, constraints, workload estimate, major tracker with PDF upload, chat panel that applies parsed actions to schedule state. |
| **Ops** | GitHub Actions for scraping on a schedule; Fly.io for the API and persistent embedding files; Vercel for the SPA. |

We glued it together as a **single workflow**: scrape → merge → embed (reindex job) → serve → chat with retrieval → optional structured schedule updates.

### Challenges we faced

1. **Embedding scale and rate limits** — Thousands of sections mean many embedding calls; we had to batch, throttle, backoff on 429s, and cap token budgets so reindexing stays reliable.
2. **Grounding vs. creativity** — Too little context and the model guesses; too much and latency and cost spike. Tuning top-K retrieval and prompt shape was iterative.
3. **Degree audit PDFs** — Real audits mix tables, indentation, and multi-word department codes. Building a parser that reconstructs OR/AND requirement trees—and keeps “one course, one major slot” rules sane—took more time than any single UI screen.
4. **SSE + actions in the browser** — Parsing partial streams, stripping fenced JSON from displayed text, and applying schedule mutations only on a clean “done” event required careful frontend state handling.
5. **Shipping on real infrastructure** — Matching CORS to dev and production origins, seeding data on first boot, and keeping embeddings on a volume so restarts don’t require a full rebuild were practical hurdles beyond “it works on localhost.”

---

## Built with

Use this block for **Devpost “Built with”** (tags + description). Adjust if you drop or swap a service.

### Languages

- **Go** — HTTP API, RAG retrieval, embedding index build, SSE chat orchestration  
- **TypeScript** — Hooks, API client, schedule utilities, degree-audit parser types  
- **JavaScript (JSX)** — React UI (pages and components)  
- **Python** — Course and RateMyProfessors scrapers; merge scripts for JSON datasets  

### Frameworks & libraries

- **Gin** — Routing and middleware (CORS, JSON APIs, streaming responses)  
- **React 18** + **Vite 7** — SPA build and dev server  
- **React Router** — Client-side routing  
- **Tailwind CSS 4** (`@tailwindcss/vite`) — Styling  
- **pdfjs-dist** — Parse degree audit PDFs in the browser  
- **react-markdown** — Render AI replies  
- **Lucide React** — Icons  
- **Radix UI** (`@radix-ui/react-slot`) + **CVA** — Button primitives  

### Data & storage

- **No SQL database** — `courses.json` and `rmp.json` loaded in memory on the server; **precomputed embedding files** (`embeddings_<yearterm>.json`) for vector search  
- **Browser `localStorage`** — Saved schedules, term choice, chat history, degree-progress state  

### Cloud, hosting & automation

- **Fly.io** — Go API in production; **persistent volume** for course data + embedding indexes  
- **Vercel** — Frontend static hosting and CDN  
- **GitHub Actions** — Scheduled / on-push scrapes and backend deploy hooks (per your repo setup)  
- **Docker** — Multi-stage image for Fly deployments  

### External APIs & AI

- **Voyage AI** — `voyage-3-lite` embeddings (`input_type`: document vs query), cosine similarity for top-K course retrieval  
- **Cerebras** — **Llama 3.3 70B** for the streaming schedule advisor (SSE)  
- **Source data (scraped, not official APIs)** — BYU class schedule site; RateMyProfessors for instructor ratings merged into the catalog  

### Dev tooling

- **npm** — Frontend package management (`package-lock.json`)  
- **TypeScript** (`tsc`) + **ESLint** — Type-checking and lint for the frontend  
- **Go modules** — Backend dependencies  

---

## Opening (15 sec)

"Every semester, BYU students spend hours manually cross-referencing professor ratings, degree requirements, time conflicts, and workload — across multiple websites. We built BYU Scheduler to make that a one-conversation problem."

---

## Demo Walkthrough (90 sec)

### 1 — Show the app (5 sec)
"This is BYU Scheduler. It pulls live course data from BYU's schedule — sections, times, seat availability — and enriches it with real RateMyProfessors ratings."

### 2 — Degree audit (15 sec)
 "A student uploads their BYU degree audit PDF — the app parses it automatically, extracts every major and GE requirement, and tracks what's left. No manual entry."

*(click My Progress tab — show requirement tree)*

### 3 — AI generates a schedule (30 sec)
 "Now watch this. I click 'Generate Schedule' —"

*(click Generate Schedule — let it stream)*

 "The AI is pulling from a vector search of actual course data — it knows which sections are available, who's teaching them, their difficulty ratings. It checks for time conflicts, respects any blocked times I've set, and targets a balanced 12–15 credit workload."

*(schedule populates on the grid)*

### 4 — Workload meter + course popup (15 sec)
 "The workload estimator uses actual contact hours — not just credit count — weighted by course level and RMP difficulty. Click any block to see full details."

*(click a course block — show the popup with RMP stats)*

### 5 — Analyze + export (15 sec)
 "I can ask it to analyze my schedule —"

*(click Analyze my schedule — let one sentence stream in)*

 "— and when I'm happy, I export directly to my calendar."

*(click the calendar icon)*

---

## Close (15 sec)

 "The AI doesn't hallucinate courses or make up times — every recommendation is grounded in live data through a RAG pipeline. The whole stack is a Go backend with Cerebras and Voyage AI, React frontend, deployed to production right now. BYU Scheduler — smarter scheduling, in under a minute."

---

## Q&A Answers

**"How does the AI know real course data?"**
 Voyage AI embeds every course section at startup. When you ask a question, we do cosine similarity search to retrieve the top relevant courses and inject them into the prompt — so the model only recommends things that actually exist this term.

**"What makes this different from just using ChatGPT?"**
 ChatGPT doesn't know BYU's live schedule, your specific degree requirements, or whether a section is full. We built the data pipeline so the AI always has current, accurate context.

**"How did you handle degree requirements?"**
 We built a PDF parser that reads BYU's degree audit format and reconstructs the full requirement tree — major requirements, options, GE buckets — then uses exclusive ownership logic so a completed course only satisfies one requirement at a time.

**"Is it live?"**
 Yes — byu-scheduler.vercel.app, backend on Fly.io with a persistent embedding index.

---

## Key Facts to Drop

| | |
|---|---|
| **AI model** | Cerebras llama-3.3-70b |
| **Embeddings** | Voyage AI voyage-3-lite, top-20 RAG retrieval |
| **Data** | Live BYU schedule, scraped nightly via GitHub Actions |
| **Deployment** | Vercel (frontend) + Fly.io (backend) |

---

## Demo Tips

- Have courses already loaded before walking up — don't start with an empty grid
- Let the AI stream visibly — judges need to *see* it working in real time
- Hit the RAG line — it directly answers the Innovation criterion and separates you from a ChatGPT wrapper
- The degree audit parser is your most technically impressive piece — mention it even if you don't demo it deeply
