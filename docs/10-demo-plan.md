# Demo Plan: ClassPulse (10 minutes, live in class)

> Assignment step 10. The demo proves the requirements, live: the class itself is the scenario, checking in and
> taking part from their own phones. Every minute maps to a use case and its requirements.

## 1. Setup
- One lecturer laptop on the projector (dashboard + projector view), the class on their own phones, at https://classpulse.giladautomation.com.
- One volunteer **outside the room** plays a student who tries to check in from a photo of the QR.
- Prepared the day before (never live, it costs quota and minutes): a published lecture summary with its lecturer report on an earlier lesson, and a homework with a few checks and hand-ins, one of them a copy.

## 2. Timeline

| Time | Part | What the class sees | Use case | Requirements |
|------|------|---------------------|----------|--------------|
| 0:00 | **Context** | The problem (faked attendance, feedback that comes too late), the users, the goals; "nothing to install" | — | SoW §1 |
| 1:00 | **Check in** | Everyone scans the projector QR; the list fills live; first-time users sign in with Google and the course appears by email | UC-01, UC-11 | FR-ATT-02…07, FR-EN-03, NFR-01 |
| 2:00 | A photo of the QR | The volunteer outside checks in from a photo: the code has expired, or they are flagged by distance | UC-01 3a, 3d | FR-ATT-03, FR-ATT-06 |
| 2:30 | **Anti-fraud** | A class photo → "~N in the photo · M checked in"; a Visual Ping on the blurred photo; the lecturer's live heatmap; flags and keep/remove | UC-13, UC-02 | FR-AF-01…07, NFR-04 |
| 4:30 | **Live class** | "I'm lost" from a few phones (the meter shows how many, never who); anonymous questions and upvotes; AI groups them into themes | UC-03 | FR-BC-01…04 |
| 5:30 | **Poll** | A slide photographed → 3 AI drafts → open with a 2-minute timer → live bars on the projector → reveal; then a hand-written question | UC-14, UC-04 | FR-PL-01…05 |
| 6:30 | **After the lecture** | The lecture page for a student who missed it; the summary with the "I'm lost" spike on its chapter; the lecturer's report (scores, tips at their moments) and its trend | UC-06, UC-15 | FR-LP-01, FR-VS-03…07 |
| 7:30 | **Homework** | A student's per-section feedback without the answer; the hand-in; the lecturer's AI grade, chart and the flagged copy | UC-09, UC-10, UC-17 | FR-HW-04…10 |
| 8:30 | **Evidence** | The traceability matrix (every Must requirement tested); CI green on Chromium and WebKit; 211 unit, 31 integration and 11 E2E tests; ≥ 98 % domain line coverage; load test p95 183 ms; one class diagram next to its code | — | NFR-02, NFR-05, NFR-07 |
| 9:15 | **Lessons** | What the measurements changed: the model choice (T8), fingerprints instead of embeddings (T9), identity by email at the lecturer's request | — | Tools report §3 |
| 9:45 | **Q&A** | | | |

Golden rule: show requirements, not code. Say what to notice before each step.

## 3. Checklist

**Prepare**
- [ ] Freeze a tagged release (`v1.0-demo`) two days before; no merges after it.
- [ ] Rehearse twice with a timer, using the [field-test protocol](assets/field-tests/README.md) phones.
- [ ] Seed realistic data: the summary, the homework with hand-ins, a course roster with the class's emails.
- [ ] Record the **backup video** (`npm run demo:video`, see §4).
- [ ] Plan B for the network: mobile data for students, a hotspot for the laptop.

**On the day**
- [ ] Arrive early; check the projector, the network, `/api/health`.
- [ ] Enlarge fonts; start the lesson in the room (its location becomes the classroom centre).
- [ ] Tie each step to its requirement out loud; keep to time.

**Avoid**
- [ ] Live coding, last-minute changes, debugging in front of the class, showing every feature.
- [ ] Hiding known issues: state the open field tests (T4–T7) honestly.

## 4. Plan B

| Failure | Response |
|---------|----------|
| The AI service is slow or out of quota | Switch the server to the mock provider (one setting, ~5 s); headcount and drafts become fixed (NFR-08) |
| A phone cannot check in | Manual approval on the attendance tab |
| The classroom network blocks the site | Students use mobile data; the laptop uses the hotspot |
| The server is down | Play the backup video: the full timeline recorded by `e2e/demo-recording.spec.ts` (lecturer and two phones, mock AI) |

## 5. After the demo
Results, timings and the class's reactions go into the [conclusion](11-conclusion.md) §3.
