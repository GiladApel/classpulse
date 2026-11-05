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
| F4 | **KISS polls**: templates or AI-generated MCQ from a slide; live results | High |
| F5 | **Lecture summary**: AI summary, chapters and review questions from a recording, with confusion spikes on the timeline | Medium |
| F6 | **Homework review**: rubric-based AI review, percentiles and class-wide common mistakes (peers' work never shown) | Medium |

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
cp .env.example .env          # fill in the keys
npm install
docker compose up pocketbase  # http://127.0.0.1:8090/_/
npm run dev:api               # http://127.0.0.1:8787/health
npm run dev:web               # http://127.0.0.1:5173
npm test
```
