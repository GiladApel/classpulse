# Statement of Work: ClassPulse

## 1. Purpose
Deliver a working, demo-ready web application and a complete set of design artifacts for a classroom teaching tool. Attendance is the core feature.

## 2. Deliverables
| ID | Deliverable | Acceptance |
|----|-------------|-----------|
| D1 | Git repository with README (problem, scope, run instructions) | Repo is public; clean clone runs with `npm install && npm run dev:*` |
| D2 | Tools report | Each listed tool was tested in practice, with measured results |
| D3 | SoW (this document) | — |
| D4 | SRS | Every requirement has an ID and is traceable to a use case and a test |
| D5 | Use cases | Covers all 6 features; each has actors, main flow and alternate flows |
| D6 | Component diagram | Matches the folder structure of `apps/api` and `apps/web` |
| D7 | Class + sequence diagrams | Class names match the code 1:1; at least 4 sequence diagrams |
| D8 | Testing strategy | A test plan per domain class; unit + E2E + load + manual |
| D9 | Deployed demo app | Reachable over HTTPS from student phones in class |
| D10 | 10-minute live demo | Follows the scripted demo with real students |
| D11 | Conclusion | Results, measured metrics, lessons learned |

## 3. Work breakdown and milestones
| M | Content | Output |
|---|---------|--------|
| M1 | Scaffold, README, tools tests, SoW, SRS, use cases | D1–D5 |
| M2 | Components, class/sequence diagrams, testing strategy | D6–D8 |
| M3 | Attendance end to end + export | F1 |
| M4 | Headcount + Roll-call + Visual Ping challenges | F2 |
| M5 | Backchannel + polls | F3, F4 |
| M6 | Lecture summary + homework review | F5, F6 |
| M7 | Tests, deployment, demo rehearsal, conclusion | D9–D11 |

## 4. Assumptions
- Students have a smartphone with a camera and a browser (iOS Safari or Android Chrome).
- The classroom has a projector and Wi-Fi or cellular coverage.
- The lecturer records lectures independently; the file is uploaded manually.
- Gemini API quota is enough for one class (~30 students).

## 5. Constraints
- No integration with Moodle, Zoom or the university's personal-information system.
- No facial recognition. Class photos stay with the lecturer; only a blurred copy is shared.
- KISS: a student reaches the "checked in" state in at most 2 taps after the first visit.
- Design only what is implemented.

## 6. Risks
| Risk | Mitigation |
|------|-----------|
| Indoor GPS inaccuracy | Geofence defaults to *lenient* (flag only); radius is configurable |
| LLM miscounts people | Count is advisory; challenges and the lecturer make the decision |
| Classroom network is slow | Small PWA bundle; QR window allows ≤20 s latency; manual approval as fallback |
| LLM quota or outage during demo | `MockProvider` + pre-processed recording summary |
| Long lecture video exceeds limits | Fall back to audio-only transcript, then summarize |
