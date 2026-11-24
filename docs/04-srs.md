# Software Requirements Specification: ClassPulse

> Assignment step 4. What the system shall do, in testable statements. Each requirement has an ID, a priority
> (MoSCoW: **M**ust, **S**hould, **C**ould) and a source deliverable from the [SoW](03-sow.md). Appendix C traces every
> requirement to its use cases, design and tests.

## 1. Introduction

### 1.1 Purpose
This document is the agreed list of what ClassPulse does. Developers build from it, the tests in the [STP/STD](08-stp-std.md) verify it, and the demo proves it.

### 1.2 Scope
ClassPulse is a web app for in-person lectures. Students use it in their phone's browser; the lecturer uses a computer and the classroom projector. It covers attendance, live engagement, AI help after the lecture, and homework feedback (features F1–F10 of the SoW). Out of scope: see [SoW §3](03-sow.md#3-scope).

### 1.3 Definitions and glossary
Each feature is described in plain words and with a picture to remember it by.

| Term | Meaning | Think of it as |
|------|---------|----------------|
| **Lesson** (session) | One lecture meeting of a course, from "start" to "end" | A class period on the timetable |
| **Check-in** | A student's attendance record in a lesson | **A concert ticket scanned at the gate**: you scan once at the entrance and you are in |
| **Rotating QR** | The code on the projector; it changes every 10 seconds | A ticket that expires every few seconds, so a photo sent to a friend at home is useless |
| **Location check** (geofence) | A check-in far from the lecturer's position is flagged (lenient) or refused (strict) | The usher who looks up when someone enters from the wrong door |
| **Headcount** | The number of people the AI counts in a class photo | Counting heads from the front of the room |
| **Challenge** (Roll-call, Visual Ping) | A short check of those who checked in, when the headcount does not match | A spot check: "everyone who is here, point at your seat on this photo" |
| **"I'm lost" meter** | Anonymous taps that show how many are lost right now | A dashboard warning light: it does not say who, only that something needs attention |
| **Forum** | Questions and comments of a lesson (while it is live) or of the course (any time) | A raised hand that does not interrupt the lecture |
| **Poll** | A multiple-choice question every phone switches to | A quiz-show buzzer round with a clock |
| **Lecture summary** | AI summary of a recording for students | The notes of the friend who never misses a lecture |
| **Lecturer report** | Short AI report for the lecturer only, with scores and tips | A coach watching the game tape with you, not a 70-page report |
| **Rubric** | What each section of a homework must contain, built by the AI from the PDF; hidden from students | The grader's answer sheet, which stays in the grader's drawer |
| **Feedback check** | A student's practice submission, scored per section, without answers | A driving lesson before the test: you learn what to fix, nobody gives you the answer |
| **Hand-in** | The student's final submission, graded by the AI as a draft for the lecturer | Submitting the exam paper |
| **Roster** | The list of students of a course, by email | The guest list at the door: the email you sign in with is your name on the list |
| **Student key** | The internal number that ties a student's records together; a 9-digit ID when the roster has one, otherwise generated | The cloakroom ticket number: you never see it, it just keeps your things together |

### 1.4 References
[README](../README.md) · [SoW](03-sow.md) · [Use cases](05-use-cases.md) · [SDD](06-sdd.md) · [EDD](07-edd/README.md) · [STP/STD](08-stp-std.md) · [Tools report](02-tools-report.md)

## 2. Overall description

### 2.1 Product perspective
A new, self-contained product. Three parts: **PocketBase** (sign-in, data, live updates), the **ClassPulse API** (every business rule), and an **LLM provider** (Gemini by default, behind an interface). Students' phones and the lecturer's computer read data directly from PocketBase and write through the API ([SDD](06-sdd.md)).

### 2.2 User classes
| Class | Uses | Frequency |
|-------|------|-----------|
| Student | Phone browser: check-in, forum, polls, lecture page, homework | Every lecture |
| Lecturer | Computer and projector: runs lessons, rosters, homework, reports | Every lecture |
| Admin | Appoints lecturers | Rarely |
| System | Background jobs: AI summaries, grading, timers that close polls and checks | Continuously |

### 2.3 Operating environment
Current iOS Safari and Android Chrome on the students' side; a current desktop browser on the lecturer's side. Server: Linux with Docker, behind Cloudflare (HTTPS).

### 2.4 Constraints
- No integration with Moodle, Zoom or the university's personal-information system.
- No face recognition; class photos are used only to count people.
- Design only what is implemented (every requirement here exists in the code).
- KISS: nothing to install; Hebrew right-to-left interface.

### 2.5 Assumptions
Students have a smartphone with a camera and a Google account; the classroom has a projector and network coverage; the lecturer records lectures independently.

## 3. Specific requirements

### 3.1 Functional requirements

#### F1: Attendance (source D-9/F1)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-ATT-01 | let the lecturer start and end a lesson; starting records the lecturer's location, the location-check mode (lenient/strict) and radius (default 50 m) | M |
| FR-ATT-02 | show, while a lesson is active, a QR code on the projector that encodes a URL with an HMAC-signed token, issuing a new token every 10 s | M |
| FR-ATT-03 | accept a token only within its own or the next window (≤ 20 s) and only for its lesson, and reject a tampered token | M |
| FR-ATT-04 | sign a student in with Google; a student whose email is on a roster needs no other input, and later check-ins need one tap | M |
| FR-ATT-05 | record at most one check-in per student per lesson, and accept at most one student per device per lesson | M |
| FR-ATT-06 | in lenient mode accept and flag a check-in beyond the radius; in strict mode reject it with a message; treat a missing location as beyond the radius | M |
| FR-ATT-07 | show check-ins on the lecturer's list in real time: name, ID (when the roster gave one), time, distance, flags, status | M |
| FR-ATT-08 | let the lecturer approve a student by hand with a note, and remove a record | M |
| FR-ATT-09 | export a lesson's attendance as `.xlsx` or `.csv`, or to a Google Sheet, with each student's name and email | M |

#### F2: Anti-fraud (source D-9/F2)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-AF-01 | take a class photo from the lecturer and return a people count, a confidence value and person boxes from the LLM | M |
| FR-AF-02 | compare the people count with the present check-ins and highlight a mismatch beyond a tolerance (default 10 %) | M |
| FR-AF-03 | run a **Roll-call**: a 30 s one-time QR; checked-in students who do not rescan in time are marked `no_response` | M |
| FR-AF-04 | run a **Visual Ping**: blur the photo on the server and send it only to checked-in students, who each tap their seat once within 45 s | M |
| FR-AF-05 | show the lecturer the taps as a live heatmap on the clear photo | S |
| FR-AF-06 | label each response `ok`, `empty_seat`, `collision` or `no_response` when the challenge closes, by hit-testing against the person boxes, and flag every record not `ok` | M |
| FR-AF-07 | leave the final decision to the lecturer: keep or remove each flagged record | M |
| FR-AF-08 | show the clear photo only to the lecturer and delete it when the lesson ends | M |
| FR-AF-09 | run a Visual Ping **after class** for 24 hours, during or after the lesson, answered from a card on the lesson page with the same labels and the lecturer's decision | S |

#### F3: Live backchannel (source D-9/F3)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-BC-01 | accept "I'm lost" at most once per 60 s per student and show the share of those present who pressed it in the last 2 minutes, never who; after the tap the student may add an anonymous note to the forum | M |
| FR-BC-02 | accept questions and suggestions, optionally anonymous, in a lesson's forum while it is live; after it ends, keep that forum read-only and point to the course forum | M |
| FR-BC-03 | let participants upvote a post once each, and let the lecturer mark it answered | M |
| FR-BC-04 | group open posts into themes with the AI on the lecturer's request | C |
| FR-BC-05 | let every course member take part in a live lesson ("I'm lost", questions, upvotes, polls), checked in or not; attendance is recorded only by the QR in the room | M |
| FR-BC-06 | give every course a general forum open to its members at any time, where the lecturer answers | M |
| FR-BC-07 | let the lecturer switch questions off during a lesson ("questions only after class"), without affecting polls and "I'm lost" | S |

#### F4: Polls (source D-9/F4)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-PL-01 | create a poll from a photo or image of a slide, or written by hand with 2–6 answers and an optional correct answer | M |
| FR-PL-02 | return 3 AI multiple-choice drafts for a slide, which the lecturer picks from and edits before opening | M |
| FR-PL-03 | switch every connected student's screen to a poll when it opens, and accept one vote per student | M |
| FR-PL-04 | update results live on the projector and reveal the correct answer when the poll closes | M |
| FR-PL-05 | close a poll automatically after the time the lecturer picks (1, 2 or 5 minutes; default 2), showing a countdown on phones, the projector and the dashboard | S |

#### F5: Lecture summary and the lecturer's report (source D-9/F5)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-VS-01 | accept a recording (video/audio up to 2 GB, in 50 MB chunks) or a transcript (vtt/srt/txt) for a lesson | S |
| FR-VS-02 | process it in the background and show its status: queued → processing → done / failed | S |
| FR-VS-03 | produce a TL;DR, timestamped chapters, key concepts and 5 review questions | S |
| FR-VS-04 | overlay "I'm lost" spikes on the timeline, aligned by the recording's offset from the lesson start | S |
| FR-VS-05 | let the lecturer publish the summary to students | S |
| FR-VS-06 | write a short **report for the lecturer** from the same source and the class signals: clarity, pace and engagement scores (1–5), 3–5 tips each tied to a moment, promises not kept, language slips and, for a recording, sound quality; never shown to students | S |
| FR-VS-07 | show the three scores across the course's lessons as a trend, and rebuild a failed report | C |

#### F6: Homework review (source D-9/F6)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-HW-01 | let the lecturer publish a homework PDF with a title, an optional due date and optional instructions to the AI, and build from them, once, a rubric: questions, sections, requirements, key points and what would give the answer away | S |
| FR-HW-02 | show the rubric and the instructions to the lecturer only; students see the PDF and section names only | S |
| FR-HW-03 | rebuild the rubric with new instructions until the first hand-in, then lock it | S |
| FR-HW-04 | give feedback on a solution (one PDF or up to 10 photos): per section a score 1–100 (0 if unanswered), what meets the requirements, what is missing and a direction, without ever giving the answer | S |
| FR-HW-05 | compute scores on the server: a question is the average of its sections, the total is the average of the questions, rounded, at least 1 | S |
| FR-HW-06 | allow 2 feedback checks per student per homework; a failed check does not count; practice files are never stored | S |
| FR-HW-07 | accept one hand-in per student with a confirmation, store its files for the student and the lecturer only, and mark a late hand-in | S |
| FR-HW-08 | grade a hand-in against the rubric in the background as a draft visible only to the lecturer, with a retry on failure | S |
| FR-HW-09 | show the lecturer per student the checks used, the hand-in, the AI grade and report, and a chart of the graded hand-ins; students see no chart or ranking | S |
| FR-HW-10 | build class-wide common mistakes (shown to students without names), list highly similar hand-ins for the lecturer, and ignore text in a solution that addresses the reviewer | C |

#### F7: Lecture page (source D-9/F7)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-LP-01 | give every lecture a page for every course member, including those who missed it: summary, materials, practice questions, closed polls with results, questions with answers | S |
| FR-LP-02 | let the lecturer publish open review questions, by hand or as up to 8 AI drafts from the slide deck (≤ 50 MB) | C |
| FR-LP-03 | let the lecturer attach files (≤ 50 MB) and links, downloadable only by course members | S |
| FR-LP-04 | let the lecturer answer a question under it, which marks it answered | S |
| FR-LP-05 | show next to a lesson with homework "homework to hand in" with the earliest due date, or "homework handed in" | C |

#### F8: Lecture comments (source D-9/F8)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-FB-01 | offer every course member an optional anonymous comment on a lecture once it ends (one of four options plus text), on open phones at once and on the lecture page for 7 days | S |
| FR-FB-02 | accept one comment per student and state that it is anonymous | S |
| FR-FB-03 | show the lecturer only the aggregate, and only from 3 answers, ordered by option, never by time; nobody can read a single answer or its author | S |
| FR-FB-04 | export a lecture's questions (with answers and upvotes; a name only where given) and comments (anonymous, from 3 answers, without times) to Excel, CSV or Google Sheets | S |

#### F9: Administration (source D-9/F9)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-AD-01 | let admins (set by email in the server configuration) find users and make a user a lecturer or a student; an admin cannot change their own role | M |
| FR-AD-02 | let a lecturer create courses (code and name), unique per lecturer and code | M |

#### F10: Enrollment and timetable (source D-9/F10)
| ID | The system shall… | Pri |
|----|-------------------|-----|
| FR-EN-01 | import a roster from Excel, CSV or a pasted list: one student per row with an **email** (an ID is optional) and a name, in any column order; a repeat upload adds and updates but never removes; invalid, missing or repeated rows are reported by line | M |
| FR-EN-02 | let the lecturer add or remove one student and **fix a mistyped email**; the roster shows who has signed in and highlights rows still waiting for a sign-in | M |
| FR-EN-03 | link a student to every roster row with the email they sign in with, on their first visit and whenever the lecturer adds or fixes that email; a student sees only their own roster row | M |
| FR-EN-04 | accept a check-in from a student not on the roster, mark it "not on roster", and let the lecturer add them in one tap | S |
| FR-EN-05 | tell a signed-in student with no course which email they used, so a mismatch can be fixed | S |
| FR-TT-01 | let the lecturer set the weekly meetings (day, start, end, room; no overlaps on a day) and the term dates | S |
| FR-TT-02 | show a weekly timetable of the user's courses: the whole week on a computer, one day on a phone; mark a course with a live lesson | S |
| FR-TT-03 | show every live lesson of the user's courses on the home screen; the lecturer's home shows the meeting happening now with a one-tap start | M |
| FR-TT-04 | give each lesson one page with tabs: attendance, forum, materials, homework; scanning the QR checks in and opens the forum tab | M |

### 3.2 External interfaces
| Interface | Description |
|-----------|-------------|
| User interface | Hebrew, right-to-left, responsive web app; phone layout for students, wide layout and a full-screen projector view for the lecturer |
| HTTP API | JSON over HTTPS under `/api`, Bearer token from PocketBase sign-in ([API docs](07-edd/README.md#api)) |
| Realtime | PocketBase server-sent events; access rules decide who receives each event |
| LLM | `LLMProvider` interface: Gemini (default model `gemini-3.1-flash-lite`) or the mock |
| Google OAuth | Student sign-in through PocketBase |
| Google Sheets API | Optional live export, through a service account |

### 3.3 Non-functional requirements
| ID | Requirement | Verified by |
|----|-------------|-------------|
| NFR-01 | **Usability:** a returning student checks in in ≤ 2 taps and ≤ 5 s from scanning; Hebrew RTL UI | E2E scenario 1, field test T7 |
| NFR-02 | **Performance:** 80 check-ins within 30 s with server p95 < 500 ms; realtime updates in < 1 s | Load test T1 (p95 183 ms) |
| NFR-03 | **Security:** HTTPS only; the QR secret stays on the server; business writes only through the API | Integration tests on access rules |
| NFR-04 | **Privacy:** no face recognition; only blurred photos are shared and photos are deleted at lesson end; anonymous authors hidden from everyone except the system | Integration tests on hidden fields |
| NFR-05 | **Portability:** works on current iOS Safari and Android Chrome without installing | E2E on WebKit and Chromium in CI |
| NFR-06 | **Maintainability:** domain logic in classes behind interfaces; the LLM provider and exporters can be swapped without touching services | Class diagrams, ADR-001 |
| NFR-07 | **Testability:** ≥ 80 % line coverage on domain packages; the LLM and the clock are injectable | CI coverage gate |
| NFR-08 | **Availability:** the demo works if the LLM is unavailable (mock provider, manual approval) | E2E runs on the mock |

## 4. Appendices

### A. Use cases
See [05-use-cases.md](05-use-cases.md). Each use case lists the requirements it covers.

### B. Data dictionary
Collections in PocketBase (schema as code in `pocketbase/pb_migrations`). **Hidden** fields are never returned to clients; only the API (superuser) reads them. Every collection also has `id`.

| Collection | Fields (hidden in **bold**) | Purpose |
|------------|-----------------------------|---------|
| users | email, name, avatar, student_id (student key), role | Accounts; Google sign-in |
| courses | code, name, lecturer → users, term_start, term_end | A lecturer's course |
| enrollments | course, email, student_number (key, set when linked), name, added_at | The roster |
| course_slots | course, weekday, starts, ends, room | The weekly timetable |
| sessions | course, title, status, started_at, ended_at, geo_lat, geo_lng, geo_radius_m, geofence_mode, **qr_secret**, questions_paused | Lessons |
| attendance_records | session, student, student_number, student_name, device_id, checked_in_at, method, distance_m, geo_flag, status, note | Check-ins |
| headcounts | session, photo (lecturer only), blurred_photo, people_count, confidence, boxes, checkins_at_snap | Class photos and AI counts |
| challenges | session, headcount, type, status, started_at, expires_at, **secret**, image | Roll-call and Visual Ping |
| challenge_responses | challenge, student, student_number, x, y, responded_at, verdict | Answers to challenges |
| lost_signals | session, **student**, **student_number**, at | "I'm lost" taps |
| feed_posts | course, session (empty = course forum), **author**, **author_number**, display_name, anonymous, text, votes, answered, answer, posted_at | Forum posts |
| post_votes | post, voter, voter_number | Upvotes |
| polls | session, question, options, **correct_index**, answer_index, status, source, results, created_at, opened_at, closed_at, closes_at | Polls |
| poll_votes | poll, student, student_number, option_index | Votes |
| lesson_feedback | session, **student**, **student_number**, rating, comment, submitted_at | Anonymous lecture comments |
| recordings | session, kind, filename, mime_type, size_bytes, offset_sec, status, error, summary, published, created_at, processed_at, **coaching**, coaching_error | Summaries and lecturer reports |
| materials | session, title, kind, url, file, filename, added_at | Lecture files and links |
| practice_questions | session, question, source, created_at | Open review questions |
| assignments | course, session, title, due_at, file, **outline**, **guide**, guide_status, guide_error, **rubric_notes**, created_at | Homework and its hidden rubric |
| submissions | assignment, student, student_number, student_name, **fingerprint**, status, error, total, late, submitted_at, reviewed_at, check_count, report, handed_in_at, files (protected), final_status, final_error, **final_report**, **final_total** | Feedback checks and hand-ins |
| assignment_insights | assignment, submission_count, common_mistakes, **similar_pairs**, built_at | Class-wide analysis |

### C. Traceability matrix
Generated by `tools/trace.ts` from the use cases, the design documents and the test titles; CI fails when a Must requirement has no test. Status: **Passed** (has automated tests, CI green), **Manual** (verified by a manual or field test), **Gap** (no test yet).

<!-- trace:start -->
75 requirements: 71 Passed, 4 Manual, 0 Gap.

| Requirement | Pri | Use cases | Design | Test cases | Status |
|-------------|-----|-----------|--------|------------|--------|
| FR-ATT-01 | M | UC-11 | EDD-Attendance, SDD §2.3 | TC-008 | Passed |
| FR-ATT-02 | M | UC-01, UC-11 | EDD-Attendance, SDD §2.3 | TC-001, TC-003 | Passed |
| FR-ATT-03 | M | UC-01 | EDD-Attendance, SDD §2.3 | TC-001, TC-002, TC-004 | Passed |
| FR-ATT-04 | M | UC-01 | EDD-Attendance, SDD §2.3 | TC-011 | Passed |
| FR-ATT-05 | M | UC-01 | EDD-Attendance, SDD §2.3 | TC-005, TC-006 | Passed |
| FR-ATT-06 | M | UC-01 | EDD-Attendance, SDD §2.3 | TC-007 | Passed |
| FR-ATT-07 | M | UC-12 | EDD-Attendance, SDD §2.10, SDD §2.3 | TC-003 | Passed |
| FR-ATT-08 | M | UC-12 | EDD-Attendance, SDD §2.3 | TC-009 | Passed |
| FR-ATT-09 | M | UC-12 | EDD-Attendance, EDD-Infrastructure, SDD §2.3, SDD §2.9 | TC-010 | Passed |
| FR-AF-01 | M | UC-13 | EDD-AI, EDD-AntiFraud, SDD §2.5, SDD §2.8 | TC-012, TC-013 | Passed |
| FR-AF-02 | M | UC-13 | EDD-AntiFraud, SDD §2.5 | TC-012 | Passed |
| FR-AF-03 | M | UC-02, UC-13 | EDD-AntiFraud, SDD §2.5 | TC-013, TC-014, TC-022 | Passed |
| FR-AF-04 | M | UC-02, UC-13 | EDD-AntiFraud, EDD-Infrastructure, SDD §2.5, SDD §2.9 | TC-015, TC-017, TC-022 | Passed |
| FR-AF-05 | S | UC-13 | EDD-AntiFraud, SDD §2.5 | TC-018 | Manual |
| FR-AF-06 | M | UC-02, UC-13 | EDD-AntiFraud, SDD §2.5 | TC-015, TC-016 | Passed |
| FR-AF-07 | M | UC-13 | EDD-AntiFraud, SDD §2.5 | TC-019 | Passed |
| FR-AF-08 | M | UC-11 | EDD-AntiFraud, SDD §2.5 | TC-020 | Passed |
| FR-AF-09 | S | UC-02, UC-13 | EDD-AntiFraud, SDD §2.5 | TC-021 | Passed |
| FR-BC-01 | M | UC-03 | EDD-LiveClass, SDD §2.6 | TC-023, TC-024, TC-025 | Passed |
| FR-BC-02 | M | UC-03 | EDD-LiveClass, SDD §2.6 | TC-025, TC-026, TC-027 | Passed |
| FR-BC-03 | M | UC-03, UC-08 | EDD-LiveClass, SDD §2.6 | TC-028 | Passed |
| FR-BC-04 | C | UC-16 | EDD-AI, EDD-LiveClass, SDD §2.6, SDD §2.8 | TC-029 | Passed |
| FR-BC-05 | M | UC-03, UC-05 | EDD-Courses, EDD-LiveClass, SDD §2.4 | TC-030 | Passed |
| FR-BC-06 | M | UC-08 | EDD-LiveClass, SDD §2.6 | TC-027, TC-031 | Passed |
| FR-BC-07 | S | UC-03 | EDD-LiveClass, SDD §2.6 | TC-032 | Passed |
| FR-PL-01 | M | UC-14 | EDD-LiveClass, SDD §2.6 | TC-033, TC-034 | Passed |
| FR-PL-02 | M | UC-14 | EDD-AI, EDD-LiveClass, SDD §2.6, SDD §2.8 | TC-033 | Passed |
| FR-PL-03 | M | UC-04, UC-14 | EDD-LiveClass, SDD §2.10, SDD §2.6 | TC-035, TC-038 | Passed |
| FR-PL-04 | M | UC-04, UC-14 | EDD-LiveClass, SDD §2.10, SDD §2.6 | TC-035, TC-036 | Passed |
| FR-PL-05 | S | UC-04, UC-14 | EDD-LiveClass, SDD §2.6 | TC-037 | Passed |
| FR-VS-01 | S | UC-15 | EDD-Infrastructure, EDD-LectureContent, SDD §2.7, SDD §2.9 | TC-039 | Passed |
| FR-VS-02 | S | UC-15 | EDD-LectureContent, SDD §2.7 | TC-039 | Passed |
| FR-VS-03 | S | UC-15 | EDD-AI, EDD-LectureContent, SDD §2.7, SDD §2.8 | TC-040 | Passed |
| FR-VS-04 | S | UC-15 | EDD-LectureContent, SDD §2.7 | TC-041 | Passed |
| FR-VS-05 | S | UC-06, UC-15 | EDD-LectureContent, SDD §2.7 | TC-042 | Passed |
| FR-VS-06 | S | UC-15 | EDD-AI, EDD-LectureContent, SDD §2.7, SDD §2.8 | TC-043 | Passed |
| FR-VS-07 | C | UC-15 | EDD-LectureContent, SDD §2.7 | TC-044 | Passed |
| FR-HW-01 | S | UC-17 | EDD-AI, EDD-Homework, SDD §2.7, SDD §2.8 | TC-045 | Passed |
| FR-HW-02 | S | UC-09, UC-17 | EDD-Homework, SDD §2.7 | TC-046 | Passed |
| FR-HW-03 | S | UC-17 | EDD-Homework, SDD §2.7 | TC-047 | Passed |
| FR-HW-04 | S | UC-09 | EDD-AI, EDD-Homework, SDD §2.7, SDD §2.8 | TC-048 | Passed |
| FR-HW-05 | S | UC-09 | EDD-Homework, SDD §2.7 | TC-049 | Passed |
| FR-HW-06 | S | UC-09 | EDD-Homework, SDD §2.7 | TC-050, TC-055 | Passed |
| FR-HW-07 | S | UC-10 | EDD-Homework, SDD §2.7 | TC-051, TC-055 | Passed |
| FR-HW-08 | S | UC-10, UC-17 | EDD-AI, EDD-Homework, SDD §2.7, SDD §2.8 | TC-052, TC-055 | Passed |
| FR-HW-09 | S | UC-17 | EDD-Homework, SDD §2.7 | TC-053 | Passed |
| FR-HW-10 | C | UC-09, UC-17 | EDD-AI, EDD-Homework, SDD §2.7 | TC-054 | Passed |
| FR-LP-01 | S | UC-06 | EDD-LectureContent, SDD §2.7 | TC-056 | Passed |
| FR-LP-02 | C | UC-16 | EDD-AI, EDD-LectureContent, SDD §2.7, SDD §2.8 | TC-057 | Passed |
| FR-LP-03 | S | UC-16 | EDD-LectureContent, SDD §2.7 | TC-058 | Passed |
| FR-LP-04 | S | UC-08, UC-16 | EDD-LectureContent, SDD §2.7 | TC-059 | Passed |
| FR-LP-05 | C | UC-06, UC-10 | EDD-Homework, SDD §2.7 | TC-060 | Passed |
| FR-FB-01 | S | UC-07 | EDD-LiveClass, SDD §2.6 | TC-061 | Passed |
| FR-FB-02 | S | UC-07 | EDD-LiveClass, SDD §2.6 | TC-061 | Passed |
| FR-FB-03 | S | UC-07 | EDD-LiveClass, SDD §2.6 | TC-062 | Passed |
| FR-FB-04 | S | UC-07 | EDD-Infrastructure, EDD-LiveClass, SDD §2.6, SDD §2.9 | TC-063 | Passed |
| FR-AD-01 | M | UC-22 | EDD-Courses, SDD §2.4 | TC-064 | Passed |
| FR-AD-02 | M | UC-18 | EDD-Courses, SDD §2.4 | TC-065 | Passed |
| FR-EN-01 | M | UC-19 | EDD-Courses, SDD §2.4 | TC-066 | Passed |
| FR-EN-02 | M | UC-19, UC-20 | EDD-Courses, SDD §2.4 | TC-067 | Passed |
| FR-EN-03 | M | UC-01, UC-05, UC-19, UC-20 | EDD-Courses, SDD §2.4 | TC-011, TC-068 | Passed |
| FR-EN-04 | S | UC-01, UC-12 | EDD-Courses, SDD §2.4 | TC-069 | Passed |
| FR-EN-05 | S | UC-05, UC-20 | EDD-Courses, SDD §2.4 | TC-067 | Passed |
| FR-TT-01 | S | UC-21 | EDD-Courses, SDD §2.4 | TC-070 | Passed |
| FR-TT-02 | S | UC-05, UC-21 | EDD-Courses, SDD §2.4 | TC-070 | Passed |
| FR-TT-03 | M | UC-05, UC-11, UC-21 | EDD-Courses, SDD §2.4 | TC-071 | Passed |
| FR-TT-04 | M | UC-01, UC-05 | EDD-Courses, SDD §2.4 | TC-003 | Passed |
| NFR-01 | M | — | SDD §7 | TC-003, TC-077 | Passed |
| NFR-02 | M | — | SDD §7 | TC-072 | Manual |
| NFR-03 | M | — | SDD §2.10 | TC-068, TC-073 | Passed |
| NFR-04 | M | — | SDD §2.10 | TC-017, TC-024, TC-026, TC-062 | Passed |
| NFR-05 | M | — | SDD §7 | TC-074, TC-077 | Passed |
| NFR-06 | M | — | EDD-Infrastructure, SDD §7 | TC-075 | Manual |
| NFR-07 | M | — | EDD-Infrastructure, SDD §7 | TC-075 | Manual |
| NFR-08 | M | — | SDD §7 | TC-076 | Passed |
<!-- trace:end -->
