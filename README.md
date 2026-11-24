# ClassPulse

[![CI](https://github.com/GiladApel/classpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/GiladApel/classpulse/actions/workflows/ci.yml)

**One web app for the in-person lecture: attendance that is hard to fake, a live channel from the class to the lecturer, and AI help after class — on every student's phone, with nothing to install.**
Built for *Introduction to Software Engineering*, Ariel University (Assignment 2).

## Problem
An in-person lecture runs on scattered tools: a paper sheet or a form for attendance that is easy to fake, a separate app for polls, questions that never get asked, and feedback that arrives after the course is over. Recordings and homework pile up without anyone analysing them. Lecturers need **one simple tool** that students open with the phone camera, and that uses AI where it actually helps.

## Features

| # | Feature | Think of it as |
|---|---------|----------------|
| F1 | **Attendance:** a QR on the projector that changes every 10 s; one scan checks in; the lecturer's list fills live; export to Excel, CSV or Google Sheets | A concert ticket scanned at the gate |
| F2 | **Anti-fraud:** the AI counts people in a class photo; when check-ins don't match, students tap their seat on a blurred copy of the photo (or rescan a one-time QR); the lecturer decides | A spot check: "point at your seat" |
| F3 | **Live channel:** "I'm lost" (how many, never who), anonymous questions with upvotes, a course forum | A raised hand that does not interrupt |
| F4 | **Polls:** from a photo of a slide (AI drafts 3) or written by hand; closes by itself after 2 minutes | A quiz-show buzzer round with a clock |
| F5 | **Lecture summary and lecturer report:** a summary for students from the recording; a short report for the lecturer with scores and tips at their moments, and a trend | A coach watching the game tape with you |
| F6 | **Homework review:** a hidden AI rubric from the homework PDF; 2 feedback checks that never give the answer; one hand-in graded as a draft for the lecturer; copy detection | A driving lesson before the test |
| F7 | **Lecture page:** everything about one lecture, also for those who missed it | The notes of a friend who never misses class |
| F8 | **Lecture comments:** anonymous, for a week, shown from 3 answers, exported to Excel | A suggestion box |
| F9 | **Administration:** admins appoint lecturers; lecturers create courses | — |
| F10 | **Courses and timetable:** the roster by email, the weekly timetable, live lessons on the home screen | The guest list at the door |

**Out of scope:** Zoom/Meet attendance, Moodle and the university's personal-information system, face recognition, store apps, submitting grades ([SoW §3](docs/03-sow.md#3-scope)).

## Quick start

**Use it:** open https://classpulse.giladautomation.com on a phone and sign in with Google. A lecturer adds your email to a course roster; the course then appears on your home screen.

**Run it locally** (Node 24, Docker):
```bash
cp .env.example .env                 # fill in a PocketBase superuser email and password; LLM_PROVIDER=mock needs no key
npm install
docker compose up -d pocketbase      # applies pocketbase/pb_migrations; admin UI http://127.0.0.1:8090/_/
npm run dev:api                      # http://localhost:8787/health
npm run dev:web                      # http://localhost:5173 (proxies /api to the API)
npm run seed -w apps/api -- lecturer@example.com 'Passw0rd!' "Dr. Lecturer" I2SE "Introduction to Software Engineering"
```

## Usage example: one lesson's attendance
1. The lecturer taps **"start the lesson now"** on the home screen (during a meeting from the timetable) and opens the projector view.
2. Students scan the QR with the phone camera. A first-time student signs in with Google and is linked to the course by email; after that a check-in is one scan.
3. The lecturer's attendance tab fills live. A student who checked in from 300 m away is flagged.
4. The lecturer takes a class photo: "~28 in the photo · 33 checked in". A Visual Ping sends the blurred photo to the checked-in phones; each student taps their seat. A tap on an empty seat is flagged; the lecturer removes it.
5. The lecturer exports the list to Excel: name, email, time, method, flags.

## Configuration
Settings are environment variables in `.env` (never committed; names only here):
`PB_URL`, `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`, `QR_WINDOW_SEC`, `ADMIN_EMAILS`, `LLM_PROVIDER` (`gemini` or `mock`), `GEMINI_API_KEY`, `GEMINI_MODEL`, `GOOGLE_SERVICE_ACCOUNT_FILE`, `GOOGLE_SHEETS_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. The web app reads `VITE_PB_URL` from `apps/web/.env`. Without a Gemini key, use `LLM_PROVIDER=mock`: every feature still works with fixed AI replies.

## Tests
```bash
npm test                                   # unit + HTTP (in memory, ~5 s)
npm run coverage -w apps/api               # with the ≥ 80 % line gate on the domain packages
npm run test:int -w apps/api               # integration, against the running PocketBase
npm run e2e                                # browser scenarios (Playwright), against PocketBase
npm run trace                              # rebuild the requirements traceability matrix
```
CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of them on every push, the browser scenarios on Chromium and WebKit. The plan and the test cases are in the [STP/STD](docs/08-stp-std.md).

## Repository structure
```
apps/api      Hono API in TypeScript: the domain classes (attendance, challenge, engagement, content, ai, infra)
apps/web      React app: student, lecturer and projector screens (Hebrew, right to left)
pocketbase/   schema migrations (schema as code)
e2e/          Playwright browser scenarios
spikes/       hands-on tests of the tools, against the real services
loadtest/     k6 load test
tools/        trace.ts (traceability matrix)
deploy/       Docker Compose and the deploy script
docs/         the design documents (below)
```

## Documents

| Step | Document |
|------|----------|
| 1 | Problem and scope: this README |
| 2 | [Tools report](docs/02-tools-report.md), [ADRs](docs/adr/), [spikes](spikes/) |
| 3 | [Statement of Work](docs/03-sow.md) |
| 4 | [SRS](docs/04-srs.md) (glossary, requirements, data dictionary, traceability matrix) |
| 5 | [Use cases](docs/05-use-cases.md) |
| 6 | [SDD](docs/06-sdd.md) |
| 7 | [EDD](docs/07-edd/README.md): class, sequence and state diagrams, API docs |
| 8 | [STP / STD](docs/08-stp-std.md) |
| 9 | The app: `apps/`, live at https://classpulse.giladautomation.com |
| 10 | [Demo plan](docs/10-demo-plan.md) |
| 11 | [Conclusion](docs/11-conclusion.md) |

## Deployment
`deploy/deploy.sh` builds locally, copies the build and the migrations to the server and runs PocketBase, the API and nginx with Docker Compose behind a Cloudflare tunnel ([SDD §5](docs/06-sdd.md#5-deployment), [ADR-007](docs/adr/ADR-007-hosting.md)).

## Contributing
Small commits, one part each (a class with its tests, a migration, a page, a document), with messages like `feat(api): …`, `docs(srs): …`, pushed after each part. A change to a domain class updates its EDD diagram in the same change; a renamed test updates its test case in the STD (`npm run trace` checks it).

## Contact
Gilad Apel — [GitHub @GiladApel](https://github.com/GiladApel).
