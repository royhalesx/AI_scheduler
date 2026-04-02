---
name: Project state and next steps
description: Current status of BYU Scheduler backend and remaining tasks before April 4 hackathon
type: project
---

Prerequisites scraper is intentionally out of scope — user decided not to implement it. courses.json will have empty prerequisites[] arrays and that's fine.

**Why:** Not worth the effort for the hackathon demo.
**How to apply:** Do not suggest implementing prereqs scraping or prereq-based features.

## Remaining tasks (as of 2026-03-28)
1. Finish reindex + test /api/chat end-to-end
2. Tune system prompt based on chat test results
3. Deploy API (Railway/Render/Fly.io)
4. Coordinate API URL + multi-term contract (?term=20263) with frontend teammate
5. Switch to GIN_MODE=release before demo
6. (Optional) GitHub Pages fallback for courses.json
