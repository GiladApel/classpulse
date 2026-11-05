# Software Requirements Specification: ClassPulse

## 1. Introduction
- **Product:** ClassPulse, a web-based classroom tool (PWA) for attendance, live engagement and AI-assisted learning analysis.
- **Users:** Student, Lecturer, System (scheduled jobs / AI).
- **Definitions:**
  - **Session:** one lecture meeting.
  - **Check-in:** a student's attendance record in a session.
  - **Challenge:** an on-demand verification of the students who are checked in.

## 2. Overall description
- Students use a mobile web app opened from the QR code. No install is needed; it can optionally be installed as a PWA.
- Lecturers use a desktop dashboard and a full-screen projector view.
- The system is split into three parts:
  - **PocketBase:** authentication, data storage and realtime updates.
  - **Hono API:** all business rules.
  - **LLM provider:** Gemini by default, behind an interface.

## 3. Functional requirements

### F1: Attendance
| ID | Requirement |
|----|-------------|
| FR-ATT-01 | The lecturer can start and end a session. Starting records the lecturer's geolocation and the geofence mode (lenient/strict) and radius (default 50 m). |
| FR-ATT-02 | While a session is active, the projector view shows a QR code that encodes a URL with an HMAC-signed token. A new token is issued every 10 s. |
| FR-ATT-03 | A token is accepted only within its own or the next window (≤20 s) and only for its session. A tampered token is rejected. |
| FR-ATT-04 | On first visit, the student signs in with Google and enters a student ID once. Later visits need no input beyond one tap. |
| FR-ATT-05 | A student can check in at most once per session. A device can be used by at most one student per session. |
| FR-ATT-06 | Lenient mode: a check-in beyond the radius is accepted and flagged. Strict mode: it is rejected with a message. Missing location counts as "beyond radius". |
| FR-ATT-07 | The dashboard shows check-ins in realtime: name, ID, time, distance, flags, status. |
| FR-ATT-08 | The lecturer can manually approve a student (late arrival or phone problem) with a note, and can remove a record. |
| FR-ATT-09 | The lecturer can export the session's attendance as `.xlsx` / `.csv` and sync it to a Google Sheet. |

### F2: Anti-fraud
| ID | Requirement |
|----|-------------|
| FR-AF-01 | The lecturer can upload or take a class photo. The system returns a people count, a confidence value and person bounding boxes from the LLM. |
| FR-AF-02 | The dashboard compares the people count with the number of present check-ins and highlights a mismatch beyond a tolerance (default 10%). |
| FR-AF-03 | **Roll-call challenge:** the lecturer launches a 30 s one-time QR. Checked-in students who don't rescan in time are marked `no_response`. |
| FR-AF-04 | **Visual Ping challenge:** the system blurs the photo server-side and sends it via realtime only to students who are checked in. Each student taps their seat once within 45 s. |
| FR-AF-05 | The lecturer sees the taps as a live heatmap on the clear photo. |
| FR-AF-06 | When a challenge closes, each response is labelled `ok`, `empty_seat`, `collision` or `no_response` by hit-testing against the person boxes. Every label other than `ok` flags the attendance record. |
| FR-AF-07 | The lecturer makes the final decision: keep or remove each flagged record. |
| FR-AF-08 | The clear photo is visible only to the lecturer and is deleted when the session ends. |

### F3: Live backchannel
| ID | Requirement |
|----|-------------|
| FR-BC-01 | A student can press "I'm lost" (at most once per 60 s). The dashboard shows a confusion level over a rolling 2-minute window. |
| FR-BC-02 | A student can post a question or suggestion, optionally anonymously, during or after the lecture. |
| FR-BC-03 | Participants can upvote posts (once each). The lecturer can mark a post as answered. |
| FR-BC-04 | The lecturer can request an AI clustering of open posts into themes. |

### F4: Polls
| ID | Requirement |
|----|-------------|
| FR-PL-01 | The lecturer can create a poll from a template (Yes/No, A–D, 1–5) or with free options in under 10 s. |
| FR-PL-02 | The lecturer can upload a slide image or text and receive 3 AI-generated MCQ drafts to choose from. |
| FR-PL-03 | When a poll opens, every connected student's screen switches to it automatically. One vote per student. |
| FR-PL-04 | Results update live on the projector. The correct answer is revealed when the poll closes. |

### F5: Lecture summary
| ID | Requirement |
|----|-------------|
| FR-VS-01 | The lecturer can upload a recording (mp4) or transcript (vtt/txt) for a session. |
| FR-VS-02 | The system processes it asynchronously and shows its status: queued → processing → done / failed. |
| FR-VS-03 | The output contains a TL;DR, timestamped chapters, key concepts and 5 review questions. |
| FR-VS-04 | The timeline overlays "I'm lost" spikes, aligned using the recording's offset from the session start. |
| FR-VS-05 | The lecturer can publish the summary to students. |

### F6: Homework review
| ID | Requirement |
|----|-------------|
| FR-HW-01 | The lecturer can create an assignment with a weighted rubric. |
| FR-HW-02 | A student can upload a submission (PDF, code or text) and receive an AI review per rubric criterion: score, strengths and concrete fixes. |
| FR-HW-03 | The student sees their percentile per criterion and the class-wide common mistakes. Peers' raw work and identities are never shown. |
| FR-HW-04 | The lecturer sees the score distribution, common mistakes and highly similar submission pairs for human review. |

## 4. Non-functional requirements
| ID | Requirement |
|----|-------------|
| NFR-01 | **Usability:** a returning student checks in in ≤2 taps and ≤5 s from scanning. The UI is in Hebrew (RTL). |
| NFR-02 | **Performance:** 80 check-ins within 30 s with p95 API latency < 500 ms. Realtime dashboard updates in < 1 s. |
| NFR-03 | **Security:** HTTPS only. The QR secret stays server-side. Business-rule writes are possible only through the API. |
| NFR-04 | **Privacy:** no facial recognition. Only blurred photos are shared. Photos are purged at session end. Anonymous posts hide the author from everyone except the system. |
| NFR-05 | **Portability:** works on current iOS Safari and Android Chrome without installation. |
| NFR-06 | **Maintainability:** domain logic is in TS classes behind interfaces, so the LLM provider and exporters can be swapped without touching services. |
| NFR-07 | **Testability:** ≥80% line coverage on domain classes. The LLM and the clock are injectable. |
| NFR-08 | **Availability:** the demo still works if the LLM is unavailable (Mock provider and manual approval). |

## 5. Traceability
Each FR maps to a use case in [04-use-cases.md](04-use-cases.md) (column "FRs") and to tests in `08-testing.md` (milestone 2).
