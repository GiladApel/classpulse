# ClassPulse

A KISS, LLM-ready web teaching tool for live lectures. Built for Ariel University, *Introduction to Software Engineering*, Ex2.

## Problem

Today's online teaching tools are heavy and fragmented:
- Attendance is still a paper sheet or a Moodle form that is trivial to fake.
- Student feedback arrives too late to change the lecture.
- Polls need a separate app.
- Recordings and homework pile up without anyone analysing them.

Lecturers need **one simple tool** that students open with a phone camera and that uses LLMs where they actually help.

## Scope

| # | Feature | Priority |
|---|---------|----------|
| F1 | **Attendance**: rotating server-signed QR → one-tap check-in; live dashboard; xlsx + Google Sheet export; geofence (lenient/strict); manual approval | **Core** |
| F2 | **Anti-fraud**: AI headcount from a class photo; Roll-call challenge; **Blurred Photo Heatmap challenge** | Core |
| F3 | **Live backchannel**: "I'm lost" confusion meter + questions feed (anonymous option) | High |
| F4 | **KISS polls**: AI-generated MCQ from a photographed or uploaded slide; live results | High |
| F5 | **Lecture summary**: AI summary, chapters and review questions from a recording, with confusion spikes on the timeline | Medium |
| F6 | **Homework review**: the AI builds a hidden rubric from the homework PDF and the lecturer's instructions; students get 2 feedback checks, then hand in; the AI grades hand-ins for the lecturer; class-wide common mistakes (peers' work never shown) | Medium |
| F7 | **Lecture page**: per-lecture page for the whole course (also for those who missed it): summary, materials, practice questions, poll results, questions with the lecturer's answers | Medium |
| F8 | **Lecture feedback**: when the lecture ends, students get an optional anonymous form (4 options + comment); the lecturer sees the aggregate from 3 answers | Medium |

**Out of scope:**
- Integration with Moodle, Zoom or the university's personal-information system (מידע אישי).
- Facial recognition.
- Native mobile apps.
- Grade submission.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind, PWA, Hebrew RTL |
| Data / auth / realtime | PocketBase (SQLite, Google OAuth, SSE realtime, file storage) |
| Domain API | Node + Hono + TypeScript (all business rules, OOP domain layer) |
| AI | Gemini by default, behind an `LLMProvider` strategy (Claude, n8n webhook and Mock are interchangeable) |

## Repository layout

```
apps/api      Hono API: domain classes (attendance/, challenge/, engagement/, content/, ai/, infra/)
apps/web      React PWA (student + lecturer + projector views)
pocketbase/   migrations (schema as code)
docs/         design artifacts (see below)
```

## Design documents

1. [Tools report](docs/01-tools-report.md)
2. [Statement of Work](docs/02-sow.md)
3. [SRS](docs/03-srs.md)
4. [Use cases](docs/04-use-cases.md)
5. [Components](docs/05-components.md)
6. [Class diagrams](docs/06-class-diagrams.md)
7. [Sequence diagrams](docs/07-sequence-diagrams.md)
8. [Testing strategy](docs/08-testing.md)
9. Conclusion *(after demo)*

## Run locally

```bash
cp .env.example .env          # fill in the PocketBase superuser credentials
npm install
docker compose up pocketbase  # applies pocketbase/pb_migrations; admin UI at http://127.0.0.1:8090/_/
npm run seed -w apps/api -- lecturer@example.com 'Passw0rd!' "Dr. Lecturer" I2SE "Introduction to Software Engineering"
npm run dev:api               # http://127.0.0.1:8787/health
npm run dev:web               # http://127.0.0.1:5173  (Vite proxies /api → 8787)
npm test                      # unit + HTTP tests (in-memory, no PocketBase needed)
npm run test:int -w apps/api  # integration tests against the running PocketBase
```

E2E and load tests:
```bash
npm run e2e                                   # Playwright (docs/08 §3); needs the local PocketBase, starts its own API + Vite
SSH_HOST=do-server PB_ADMIN_URL=http://127.0.0.1:18092/pb loadtest/run.sh https://<host> 80   # k6 + 80 SSE listeners (docs/08 §4)
```

## Deploy

`deploy/deploy.sh` (Git Bash) builds the API and the web app, copies them with the migrations to `do-server:/opt/classpulse`, and runs the stack in `deploy/docker-compose.yml`: PocketBase, the API and nginx on `127.0.0.1:8092`. Point a Cloudflare tunnel hostname at that port. In the Google OAuth client, add the redirect URI `https://<host>/pb/api/oauth2-redirect`. Use the PocketBase admin through an SSH tunnel (`ssh -L 18092:127.0.0.1:8092 do-server`, then http://127.0.0.1:18092/pb/_/), since it is blocked through Cloudflare.

**Google sign-in for students:** in the PocketBase admin, open *users → Options → OAuth2 → Google* and enter the client ID and secret from Google Cloud. Add `https://<pb-host>/api/oauth2-redirect` as an authorized redirect URI.

### Lecture summary and homework (M6)
- **Summary:** on the session dashboard, upload the recording (video/audio up to 2 GB, sent in 50 MB chunks) or a transcript (vtt/srt/txt), and set how many minutes after the session start the recording began. Gemini returns a TL;DR, timestamped chapters, key concepts and 5 review questions. The timeline marks "I'm lost" spikes inside the chapter where they happened. The recording itself is deleted after processing. **Publish** makes the summary visible to every student who attended any session of the course.
- **Homework:** in a lesson's (or the course's) homework tab the lecturer uploads the homework PDF, optionally with instructions to the AI for the rubric. The AI builds a rubric (requirements and expected answer per section) that only the lecturer sees, and can rebuild it with new instructions until the first hand-in. A student gets per-section feedback on a solution (PDF or photos) up to 2 times, then hands in once; the files are kept for the lecturer and the AI grades them as a draft only the lecturer sees, with a chart of the grades by name. **✨ ניתוח ההגשות** ("analyse hand-ins") shows class-wide common mistakes (which students also see, without names) and near-identical hand-ins for the lecturer to check by hand.

### Live class flow (M5)
After checking in, the student's page stays open and shows:
- **🤯 הלכתי לאיבוד** ("I'm lost"): one tap, at most once a minute. The dashboard's confusion meter shows how many of those present pressed it in the last 2 minutes, never who.
- **Questions and comments**: posted with a name or anonymously, upvoted by classmates, and allowed after class too. The lecturer marks them answered, and **✨ קיבוץ לנושאים** (group into themes) asks the AI to group open questions.
- **Polls**: when the lecturer opens one, every phone switches to it. **📷 צילום שקף** (photograph slide) opens the camera; **🖼️ העלאת תמונה** (upload image) takes a screenshot or photo from the gallery or computer. The AI drafts 3 multiple-choice questions to pick from and edit. The projector shows live bars and reveals the correct answer when the lecturer closes the poll.

### Anti-fraud flow (M4)
1. On the dashboard, **📷 צילום כיתה** (class photo): take or upload a photo of the room. AI (Gemini, or the mock) returns the people count and person boxes; the server blurs a copy. The dashboard shows "~N in the photo · M registered" and warns when check-ins exceed the count.
2. **בדיקה ויזואלית** (visual check, 45 s): every checked-in phone shows the *blurred* photo and the student taps where they sit. The lecturer watches a live heatmap on the clear photo.
3. **Roll-call** (30 s): the projector turns red with a new rotating QR, and students in the room re-scan it.
4. When time runs out, each student gets a verdict: `ok`, `empty_seat`, `collision` or `no_response`. Every non-ok record is flagged in the table, and the lecturer chooses **keep** or **remove**.
5. Privacy: no face recognition, and only the blurred photo ever reaches students. The clear photo is deleted when the session ends.

Real AI: set `LLM_PROVIDER=gemini` and `GEMINI_API_KEY=…` in `.env` (default model `gemini-3.1-flash-lite`; `gemini-2.5-*` is closed to new keys). Without them the mock provider is used: it finds 3 people and returns fixed poll drafts.

### Attendance flow (M3)
1. The lecturer signs in at `/dash`, then clicks **Start session**. The browser location becomes the classroom centre.
2. **Projector** (`/projector/:id`) shows a QR code with a new HMAC token every 10 s. Each token is valid for ≤20 s.
3. A student scans with the phone camera and is checked in on opening the page (`/c/:token`). Only the first visit asks for Google sign-in and a student ID.
4. The lecturer's dashboard updates live through PocketBase realtime. From there the lecturer can approve a student manually, remove a record, and export to Excel, CSV or Google Sheets.
