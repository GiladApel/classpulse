# Demo Script (10 minutes)

Deliverable D10. One lecturer laptop on the projector, the class on their own phones, and one friend **outside the room** who plays the cheater. URL: `https://classpulse.giladautomation.com`.

## Before class
**The day before**
- [ ] Production is up: `/api/health` and `/pb/api/health` return 200, and Google sign-in works on one iPhone and one Android phone.
- [ ] Lecture summary: on an earlier session of the demo course, upload a 5–10 min lecture clip, check the chapters, then **Publish** it. Never process video live: it costs quota and takes minutes.
- [ ] Homework: create an assignment with a 3-criterion rubric. 5 or more friends submit (one submits a renamed copy of another). Run **✨ ניתוח הכיתה** ("analyse class") once and check that exactly the copied pair is flagged.
- [ ] The cheater friend has checked in to the course before, and has the WhatsApp chat open to receive a photo of the QR.

**10 minutes before**
- [ ] Laptop: lecturer dashboard in one window, `/projector/:id` full-screen on the projector, phone hotspot ready as a backup network.
- [ ] Start the session **in the room** (its location becomes the classroom centre). Geofence: lenient.
- [ ] Keep a slide with a few lines of text open for the poll.

## Run sheet
| Time | Show | Say / point at |
|---|---|---|
| 0:00 | Projector: title + architecture (README diagram) | Problem: attendance is faked, feedback comes too late. One PWA, no install, and AI only where it helps |
| 1:00 | **Attendance.** Everyone scans the projector QR | The QR changes every 10 s and is signed on the server. The dashboard fills live, through PocketBase realtime (Observer) |
| 2:00 | The friend checks in from outside using the WhatsApp photo | Lenient geofence: the friend is checked in but flagged with the distance. Strict mode would have rejected it |
| 2:30 | **Anti-fraud.** 📷 class photo → "~N in the photo · M registered" | Gemini returns person boxes, not just a count. The server blurs a copy, so faces never reach students |
| 3:30 | **בדיקה ויזואלית** ("visual check"): phones show the blurred photo and students tap their seat; the dashboard shows the live heatmap | The friend can only guess a seat: an empty spot → `empty_seat`, someone else's seat → `collision`. The lecturer decides **keep** or **remove** (human in the loop) |
| 5:00 | **🤯 I'm lost**: ask a few students to press it. Anonymous questions + upvotes. **✨ group into themes** | The meter shows how many, never who. Anonymity is enforced by PocketBase rules, not by the UI |
| 6:00 | **Poll** **✨ from text**: pick an AI draft → open → live bars on the projector → close and reveal | The correct answer stays hidden from phones until close (hidden field) |
| 7:30 | **Lecture summary** (pre-processed): chapters + the "I'm lost" spike on the timeline | The spike is aligned to the chapter where students got lost. The recording itself is deleted after processing |
| 8:30 | **Homework analysis**: score distribution, common mistakes, flagged pair | Fingerprints instead of embeddings: our field test showed embeddings could not tell a copy from honest work (T9) |
| 9:15 | `docs/06` class diagram next to `ChallengeManager` in the code; test numbers | Strategy, Template Method, Chain of Responsibility and Repository map 1:1 to the code. 137 unit, 18 integration and 4 E2E tests, 99% domain line coverage, load test p95 183 ms |
| 10:00 | End | |

## If something fails
| Failure | Do |
|---|---|
| Gemini slow, 429 or 503 | Switch to the mock provider: `ssh do-server 'cd /opt/classpulse && sed -i s/^LLM_PROVIDER=.*/LLM_PROVIDER=mock/ .env && docker compose up -d --force-recreate api'` (about 5 s; switch back the same way). The headcount then finds 3 people and the polls use fixed drafts (NFR-08) |
| A phone cannot check in | **Manual approve** on the dashboard (student ID + note) |
| Classroom Wi-Fi blocks the site | Students use mobile data; the laptop uses the hotspot |
| The visual check gets few taps | End it early with **סיום עכשיו** ("end now"); the verdicts still show |
| Server down | `ssh do-server 'cd /opt/classpulse && docker compose ps && docker compose logs --tail 50'`, then `docker compose up -d` |

## Measure during the dry run (tools report)
- **T4:** scan the projector QR from the back row with 3 phones. Record the success rate and seconds to scan.
- **T5:** 5 phones at known seats. Record the `distance_m` each one gets (median and max) and choose the default radius.
- **T6:** blur σ 15/25/35 on a real class photo. Record the lowest σ at which faces are unidentifiable.
- **T7:** first visit with Google sign-in on iOS Safari and Android Chrome. Record taps and seconds.
- **T2:** more class photos. Record the AI count against a manual count.
- **Seat tap margin:** do back-row students hit their own box? This decides whether `SeatHitTester` needs a margin.
