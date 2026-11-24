# Conclusion: ClassPulse

> Assignment step 11. Results, plan against actual, the demo, a retrospective and future work.
> Written on 2026-11-24, before the demo; §3 is filled in after it.

## 1. Results summary
ClassPulse is a working, deployed web app for in-person lectures, used from students' phones with nothing to install. All ten planned features (F1–F10) are built and live at https://classpulse.giladautomation.com:
- **Attendance** by a rotating signed QR, with a lenient location check, manual approval and Excel/CSV/Google Sheets export.
- **Anti-fraud** without face recognition: an AI headcount, Roll-call and Visual Ping checks (also after class), with the lecturer deciding.
- **Live class:** "I'm lost", anonymous questions, a course forum, polls from a slide or by hand with automatic close.
- **After class:** lecture summaries for students, a short improvement report for the lecturer with a trend, the lecture page, anonymous comments with export.
- **Homework:** a hidden AI rubric, two feedback checks without answers, one hand-in graded as a draft for the lecturer, copy detection.
- **Courses:** admins, rosters by email, weekly timetable, live lessons on the home screen.

**Quality, measured:** 211 unit and HTTP tests, 31 integration tests against a real PocketBase, 11 browser scenarios on Chromium and WebKit, all in CI on every push; ≥ 98 % line coverage on the domain packages; 75 requirements traced, 71 by automated tests, 4 manual, none untested; 80 check-ins in 30 s at server p95 183 ms.

## 2. Plan vs. actual

| Deliverable | Planned (SoW) | Actual | Accepted? |
|-------------|---------------|--------|-----------|
| D-1 Repository + README | Clean clone runs; CI green | Done; CI on every push | Yes (CI) |
| D-2 Tools report | Every tool tried for real; ADRs | 10 field tests (T1, T8–T10 complete; T2, T3 partial; T4–T7 open), 12 ADRs, `spikes/` | Partly: T4–T7 open |
| D-3 SoW | Six parts, Zoom out of scope | Done | Yes |
| D-4 SRS | Testable, traced, no Must in Gap | 75 requirements, matrix generated in CI, 0 Gap | Yes (CI) |
| D-5 Use cases | Full template | UC-01…UC-22, use-case and activity diagrams, user stories | Yes |
| D-6 SDD | Every requirement allocated | Done | Yes |
| D-7 EDD | Names match the code; Mermaid renders | 8 component EDDs, 5 state machines, API docs; all diagrams render | Yes |
| D-8 STP/STD | Test plan per class; numbered test cases | STP A.1–A.7, TC-001…TC-077 | Yes |
| D-9 Web app | Deployed, all tests pass | Deployed; CI green | Yes (CI, live URL) |
| D-10 Demo | Every step maps to a requirement; backup video | [Demo plan](10-demo-plan.md) ready | After the demo |
| D-11 Conclusion | Results, plan vs. actual, retrospective | This document | After the demo |

**Time.** The core (M1–M7) was built on 5 November; the scope then grew through M8–M14 (5–17 November) with features the lecturer asked for in class (comments with export, a report for the lecturer, polls that close by themselves, identity by email). M15, the move of every document to the lecturer's templates, CI and identity by email, started on 23 November against a plan of 30 November. Most time went to the features added after the first plan, not to the planned ones: scope was the main schedule risk (R-7), as the SoW predicted.

## 3. Demo results
*To be filled in after the demo:* what worked live, timings against the plan, how many students checked in, what failed and how plan B worked, the lecturer's questions.

## 4. Retrospective

| Keep | Stop | Start |
|------|------|-------|
| Measuring before deciding: two spikes overturned the first plan (T8 model, T9 embeddings) | Writing documents after the code; they drifted (a documented offline queue and a planned provider that never existed had to be removed) | Generating what can be generated (the traceability matrix) and checking it in CI |
| Small commits, each with its tests | Large milestone commits (M1–M7 landed as one commit each) | Running the field tests early, on real phones, not just before the demo |
| A fake for every port, so 211 tests run in ~5 s | Planning without the lecturer's latest class in hand | A short check against the lecturer's notes every week |
| Hidden fields with an integration test each | | |

## 5. Future work
- Field tests T4–T7 on real phones, T2 with more photos, T3 on a real lecture clip.
- Zoom or Meet participation (out of scope by decision, SoW §3).
- Offline support for poor classroom networks.
- A database-side vote counter, so the API could run as more than one instance.
- Running the homework reviewer and the lecturer report on real student work and real lectures, then tuning the prompts.
