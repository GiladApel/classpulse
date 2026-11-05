# Technical Tools Report

> Status: **tests in progress.** Each row is filled in only after the tool has been tried for real (the assignment requires real-life testing). Rows marked ⏳ are not measured yet.

## 1. Selection summary
| Need | Chosen | Alternatives considered | Why |
|------|--------|------------------------|-----|
| Backend / auth / realtime | **PocketBase** | Firebase, Supabase | One binary; SQLite; built-in Google OAuth, realtime, file storage and admin UI; self-hosted on our server; schema as migrations |
| Domain API | **Hono (Node, TS)** | Express, Fastify, PocketBase JS hooks | Typed, tiny and fast; real TS classes that map to UML (PB hooks can't model classes cleanly) |
| Frontend | **React + Vite + Tailwind** | Vue, SvelteKit | Team familiarity; fast build; RTL with logical CSS properties |
| LLM (vision, video, text) | **Gemini 2.5 Flash** | Claude, GPT, Whisper + text LLM | Native long-video and image input; returns bounding boxes; free tier; JSON-schema output |
| Image blur | **sharp** | Canvas on the client | Server-side, so the clear photo never reaches students |
| QR rendering | **qrcode** (npm) | Server-rendered PNG | The token is generated on the server; only rendering happens on the client |
| Spreadsheet | **SheetJS (xlsx)** + **Google Sheets API** | CSV only | Offline file + live online sheet |
| Tests | **Vitest**, **Playwright**, **k6** | Jest, Cypress | Native ESM/TS; mobile emulation; scripted load |
| Hosting | Existing VPS + Docker Compose + Cloudflare | Render, Fly.io | HTTPS (required for camera and geolocation); no cold starts during the demo |

## 2. Field tests
| # | Tool / question | Method | Result | Status |
|---|-----------------|--------|--------|--------|
| T1 | PocketBase realtime fan-out | k6: 80 virtual users subscribe, then 80 check-ins in 30 s | p95 latency, dropped events | ⏳ |
| T2 | Gemini headcount accuracy | 8 real classroom photos vs manual count; also bounding-box quality | mean absolute error, % error | ⏳ |
| T3 | Gemini video summary | One real 75–90 min lecture | processing time, cost, quality (1–5) | ⏳ |
| T4 | QR readability | 10 s rotating QR on the classroom projector, scanned from the back row with 3 phones | success rate, time to scan | ⏳ |
| T5 | Indoor geolocation | 5 phones in the classroom vs the lecturer's position | median and max error (m), used to choose the default radius | ⏳ |
| T6 | Blur strength | sharp σ = 15/25/35 on a class photo | lowest σ where faces are unidentifiable but seats are visible | ⏳ |
| T7 | Google OAuth on mobile | First-visit flow on iOS Safari and Android Chrome | taps and seconds to finish | ⏳ |

## 3. Conclusions
*To be written after T1–T7 are measured.*
