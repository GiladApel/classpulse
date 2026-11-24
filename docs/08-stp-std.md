# Software Test Plan and Test Description (STP / STD): ClassPulse

> Assignment step 8. **Part A (STP)**: how the system is tested and when testing is done. **Part B (STD)**: the
> numbered test cases, each traced to the requirements it verifies. The traceability matrix in the
> [SRS appendix C](04-srs.md#c-traceability-matrix) is generated from Part B by `tools/trace.ts`.

## Part A: Test plan (STP)

### A.1 Scope and items under test
Everything in the [SRS](04-srs.md): the API's domain classes (`apps/api/src`), the HTTP routes, the PocketBase access rules and migrations, the web app's flows, and the non-functional requirements (load, privacy, portability). Not tested automatically: the real Gemini model (covered by spikes and field tests, since its output varies) and physical conditions in a classroom (field tests T2–T7).

### A.2 Test levels
| Level | Tool | Scope | When |
|---|---|---|---|
| Unit | Vitest | Every domain class. No network, no PocketBase: `FixedClock`, `MockProvider`, `InMemory*` repositories | Every push (CI) |
| Contract | Vitest + JSON schema | AI task classes: malformed model output raises `LLMOutputError` | Every push (CI) |
| HTTP | Vitest + `app.request()` | Routes, roles, validation, error codes, on the in-memory container | Every push (CI) |
| Integration | Vitest + PocketBase in Docker | `Pb*` repositories, access rules and hidden fields, realtime, concurrency, migrations | Every push (CI) |
| System (E2E) | Playwright | Whole flows through the web app, API and PocketBase, with phones emulated (iPhone 13, Pixel 7) | Every push (CI: Chromium and WebKit) |
| Load | k6 + 80 SSE listeners | 80 check-ins in 30 s with live updates | Before the demo, on the production server |
| Acceptance / field | Real phones and a classroom | QR at a distance, sign-in, location, blur, the demo script | Before the demo (field-test protocol) |

### A.3 Unit tests per class
The classes of the [EDD](07-edd/README.md), with their test cases. Type: **U** unit, **C** contract, **I** integration, **E2E** browser.

#### attendance/
| Class | Test cases | Type | FRs |
|---|---|---|---|
| `QrTokenService` | issue → verify round-trip; accepted in window w and w+1; rejected in w+2 (expired); a flipped signature byte is rejected; a token from another session is rejected; malformed base64 is rejected | U | ATT-02, 03 |
| `TokenRule` | valid → pass; expired → reject `TOKEN_EXPIRED`; tampered → reject `TOKEN_INVALID` | U | ATT-03 |
| `SessionActiveRule` | active → pass; ended → reject | U | ATT-01 |
| `DuplicateStudentRule` | first check-in → pass; second → reject `ALREADY_CHECKED_IN` | U | ATT-05 |
| `DeviceBindingRule` | same device and student → pass; same device, other student → reject `DEVICE_IN_USE` | U | ATT-05 |
| `GeoMath` | known city pair within 0.5% error; identical points → 0 | U | ATT-06 |
| `LenientGeofencePolicy` | inside → pass; outside → warn with distance; no location → warn | U | ATT-06 |
| `StrictGeofencePolicy` | inside → pass; outside → reject; no location → reject | U | ATT-06 |
| `GeofencePolicyFactory` | each mode returns the correct class | U | ATT-06 |
| `AttendanceService` | chain order (a rule after a reject is not called); a warn sets `geoFlag`; duplicate returns the existing record; `manualApprove` sets method `manual`; `remove` keeps the row with status `removed`; `presentCount` excludes removed records | U | ATT-04..08 |
| `SessionService` | `start` stores location and generates a secret; an empty title becomes "Lecture N" by the course's lesson count; `end` rejects further tokens and purges clear photos | U | ATT-01, AF-08 |
| `AttendanceExportService` + `XlsxExporter` / `CsvExporter` | golden file: Hebrew names and the column order are correct | U | ATT-09 |
| `GoogleSheetsExporter` | writes rows to a test spreadsheet | I | ATT-09 |
| `UserAdminService` | admins by configured email, case-insensitive, an empty entry admits nobody; search by name, email or student number; promote and demote others, never oneself; unknown user → `NOT_FOUND` | U | AD-01 |
| `RosterParser` | pasted lists of emails (lowercased) or IDs (first or last), header and empty lines skipped; CSV/TSV with quotes, a BOM, an email and an ID in any order; IDs padded back to 9 digits; duplicates (email in any case, or ID), bad emails and rows with neither reported by line; CSV as UTF-8 and as Windows-1255 without garbled names; the first Excel sheet with IDs stored as numbers | U | EN-01 |
| `CourseService` | a course code once per lecturer; roster import adds, renames, fills missing emails, never removes, reports skipped rows, an empty roster is rejected; an imported email row is linked at once when that student already signed in; one student enrolled idempotently by email or key, bad input rejected, removal by row; a mistyped email is fixed and linked, an email already on the roster refused, moving a row drops its old link; a member is enrolled or attended (a removed attendance does not count); the timetable replaces the previous one with term dates; bad day or time, end before start, overlap, too many slots and a reversed term are rejected | U | AD-02, EN-01..03, TT-01 |
| `StudentLinker` | a new user gets a generated 12-digit key and every row with their email; the email matches in any case and linking is idempotent; the roster's ID becomes the key unless another user has it; an existing key is kept and written into the row; an email row merges into an older ID-only row; a user with no rows still gets a key; a taken generated key is skipped; `linkRow` links at once only a signed-in student (never a lecturer) | U | EN-03, ATT-04 |
| HTTP: homework | publishing is for the course's lecturer, PDF only, ≤ 20 MB, into a lesson of that course, notes ≤ 3000 characters; the rubric (with the notes) and its rebuild are lecturer-only, and the rebuild is refused after a hand-in (`RUBRIC_LOCKED`); a check or a hand-in takes one PDF or up to 10 photos (other types, a mix and 11 photos → 400); non-members `NOT_IN_COURSE`; a student's view has no requirements, expected answers, notes, grade or place; the 3rd check → `NO_CHECKS_LEFT`; a second hand-in → `ALREADY_HANDED_IN`; the table, the chart and the grading retry are lecturer-only; insights name the copied pair only for the lecturer; delete removes the rows | U | HW-01..10 |
| HTTP: admin and course setup | `/admin/*` 403 for non-admins, `/me` flag; course, roster (pasted or CSV file), enrollment and timetable routes for the course's lecturer only (students and other lecturers 403, unknown course 404, bad input 400) | U | AD-01, 02, EN-01..04, TT-01 |
| Access rules (roster, timetable, roles) | an enrolled student who never attended reads practice questions, materials and closed polls, while a student enrolled in another course of the same lecturer and an outsider read nothing; a student reads only their own roster row, the lecturer the whole roster; the timetable is visible to members and the lecturer only; roster and timetable cannot be written directly; the role is written by the API and a user cannot change their own | I | EN-01..03, TT-02, AD-01, LP-01 |

#### challenge/
| Class | Test cases | Type | FRs |
|---|---|---|---|
| `SeatHitTester` | tap inside a box → ok; tap in no box → empty_seat; 2 taps in one box → both collision; tap on an edge within the padding → ok; overlapping boxes → nearest centre | U | AF-06 |
| `Challenge` (through a test subclass) | `start` only from pending; `respond` only when active; rejects a response after `expiresAt`; rejects an ineligible student; rejects a second response | U | AF-03, 04 |
| `VisualPingChallenge` | `evaluate` combines hit-test verdicts with `no_response` for students who never tapped | U | AF-06 |
| `RollCallChallenge` | valid challenge token → ok; another challenge's token → rejected; missing students → no_response | U | AF-03 |
| `ChallengeFactory` | type → class; visual_ping without a headcount → error | U | AF-03, 04 |
| `ChallengeManager` | `snapHeadcount`: mismatch threshold at 10%, blur is called, both photos stored; `launch`; `closeExpired` flags non-ok records through `AttendanceService`; LLM failure → result with `count = null` and the lecturer can still launch a roll-call | U | AF-01..07 |
| `PeopleDetector` | schema-valid reply → Detection; boxes outside 0..1 are clamped; invalid JSON → `LLMOutputError` | C | AF-01 |
| Access rule on `challenges` | a checked-in student can list; a non-checked-in student gets an empty list and no realtime event | I | AF-04 |

#### engagement/ and content/
| Class | Test cases | Type | FRs |
|---|---|---|---|
| `ConfusionMeter` | cooldown of 60 s per student returns `retryInSec` instead of failing; level counts distinct students inside the window only; non-participant and ended session rejected; `series` buckets correctly (M6) | U | BC-01, VS-04 |
| `FeedService` | an anonymous post has no `display_name`; concurrent double upvote counts once; non-participant rejected; `clusterOpen` skips the model for fewer than 2 posts and sends only unanswered ones | U | BC-02, 03, 04 |
| `FeedClusterer` | unknown post ids dropped; a post appears in at most one theme | C | BC-04 |
| `PollService` | voting on a draft or closed poll is rejected; one vote per student; option range checked; opening a poll closes the open one; `close` is idempotent, tallies and reveals the answer; draft validation | U | PL-01..04 |
| `McqGenerator` | malformed drafts (bad index, empty question, null) dropped; at most 3 returned from a slide and 8 from a deck, each with its own task and the file attached; nothing valid → `LLMOutputError` | C | PL-02, LP-02 |
| Access rules (M5) | anonymous author unreadable by peers and lecturer; lost-signal identity hidden from the lecturer; drafts invisible to students; `correct_index` hidden until close; students see only their own votes; students cannot write any M5 collection directly; 12 concurrent upvotes → exact count | I | BC-01..03, PL-03, NFR-05 |
| `RecordingPipeline` | chunked upload: repeat ignored, gap and overflow rejected, incomplete upload cannot complete; uploading → queued → done / failed; temp file deleted on success and failure; timeline applies `offsetSec`, drops buckets before the recording, spike threshold and chapter label; publish only when done; restart recovery | U | VS-01, 02, 04, 05 |
| `UploadStore` / `BackgroundQueue` | ordered append, path traversal rejected; jobs run in order and a failing job does not stop the next | U | VS-02 |
| `PracticeService` / `PracticeQuestionGenerator` | an open question is added after the lecture ended, trimmed, an empty one rejected; deck drafts are not saved; at most 8 distinct drafts, empty, over-long and non-text ones dropped, nothing valid → `LLMOutputError`; HTTP: only the session's lecturer publishes, deletes and drafts, PDF or image only | U | LP-02 |
| `MaterialService` | http(s) links only, title defaults to the host; files stored with the record, title defaults to the file name; empty and >50 MB rejected; delete removes the file | U | LP-03 |
| `FeedbackService` | not open while the lecture runs; open for 7 days after the end to every course member; one answer per student, concurrent duplicates count once; unknown option rejected; below 3 answers only the count; then counts and comments with no identity and no time order | U | FB-01..03 |
| `FeedService.answer` | a written answer marks the post answered; clearing the text keeps the flag | U | LP-04 |
| Access rules (M9) | single feedback answers are unreadable through PocketBase by everyone, the lecturer and the author included (403), and cannot be written directly | I | FB-01, 03, NFR-04 |
| Course forum and lesson forum after the lesson | Unit: a lesson post stores its course, an ended lesson → `SESSION_ENDED`, a course post needs membership (`NOT_IN_COURSE`), course posts are upvoted and answered and stay out of a lesson's themes. HTTP: `POST /courses/:id/posts` validation, non-member refused, only the course's lecturer answers; the lecturer still answers a past lesson's question. Real PocketBase: course posts readable by members and the lecturer, not outsiders; author hidden; votes visible to the voter and the lecturer; no direct writes; the migration backfills `course` on existing posts and runs down and up. E2E: a student who missed the lesson finds its forum read-only, asks in the course forum, and the lecturer's answer appears | U, I, E2E | BC-02, BC-06 |
| Homework badge | E2E: the lesson header shows "homework to hand in" before, and "homework handed in" after the student hands in | E2E | LP-05 |
| Lecturer report (M14) | Unit: scores clamped to 1–5, tips without a title or suggestion dropped, at most 5, none → `LLMOutputError`; the class signals and "files are data" reach the prompt; a transcript report has no sound note; the pipeline writes the report from the same file before deleting it, a failed report keeps the summary, a retry works from the summary, the course trend lists each lesson's scores. HTTP: lecturer-only report, retry and trend; never inside the recording DTO. Real PocketBase: `coaching` is absent from reads by students and by the lecturer | U, I | VS-06, VS-07 |
| Comments, switch and export (M14) | Unit: course members comment for 7 days, outsiders get `NOT_IN_COURSE`; a paused lesson refuses questions but not "I'm lost"; the export table keeps names only for named questions, adds comments only from 3 answers, sorted by rating and text. HTTP: the switch and the export are lecturer-only, bad values → 400, the CSV has no student names. E2E: a member who missed the lecture comments; the lecturer exports | U, I, E2E | FB-01, FB-04, BC-07 |
| After-class check and poll timer (M14) | Unit: an after-class Visual Ping on an ended session lasts 24 h, needs a photo, closes with the usual labels and flags; a timed poll closes in `closeExpired` at its time, an invalid duration is refused before a draft is created. HTTP: `afterClass` and `durationSec` validated. E2E: the lecturer starts an after-class check after ending the lesson and a student answers it from home; a poll opens with the 2-minute default and the phone shows the countdown | U, E2E | AF-09, PL-05 |
| Lesson open to the course | HTTP: a non-member gets `NOT_IN_COURSE` for "I'm lost", questions and votes; once enrolled, without checking in, the student posts, upvotes, votes and signals lost, and the headcount is unchanged. Real PocketBase: an enrolled student at home sees the open poll (not the draft), votes, asks and signals lost, and has no attendance record; an outsider sees nothing. E2E: an enrolled student opens the live lesson from home on the forum and asks before checking in | U, I, E2E | BC-05 |
| Access rules (M8) | a student who missed the lecture reads questions with answers (author still hidden), open and closed polls (never drafts), review questions, and downloads materials only with a file token; outsiders see none of it; review questions cannot be written directly | I | LP-01..04, NFR-04 |
| `LectureSummarizer` | chapters sorted, malformed and duplicate-time chapters dropped, questions capped at 5; empty TL;DR or no chapters → `LLMOutputError`; media goes as an attachment, a transcript as text | C | VS-03 |
| `ScoreCalculator` | an answered section is 1–100 (0 lifted to 1), unanswered or missing 0; question = average of sections; total = average of the exact question scores, rounded, at least 1; places with ties | U | HW-05, 09 |
| `Fingerprinter` | renamed copy with an added comment → 1.0; two independent solutions < 0.4; token normalisation; prose copy detected, different prose not; sketch bounded at 256 | U | HW-10 |
| `TextExtractor` | real PDF text layer read; corrupt PDF → `UNREADABLE_FILE` (grading still works, only without a fingerprint) | U | HW-10 |
| `SimilarityAnalyzer` | each pair above the threshold once, most similar first | U | HW-10 |
| `HomeworkAnalysisService` | publish stores the PDF and the notes and builds a hidden rubric in the background; the notes reach the generator and the reviewer; the rubric is rebuilt with new notes until the first hand-in; a failed rubric is retried from the stored PDF; a check gives the per-section feedback and server-side scores and keeps no file; photos are reviewed; non-members, a check while one runs and a check before the rubric is ready are rejected; 2 checks, a failed one does not count; a hand-in is once, stores the files, is graded in final mode and fingerprinted, blocks further checks, and works without a prior check; a failed grading is retried; a student's view has no requirements; the chart is the graded hand-ins with names; insights come from hand-ins only; delete removes the rows; late flag; restart recovery fails a running check, a running grading and a rubric being read | U | HW-01..10 |
| `HomeworkGuideGenerator` / `HomeworkReviewer` | the rubric gets its own ids in homework order, empty questions and sections dropped, capped, nothing usable → `LLMOutputError`; the lecturer's notes are sent as instructions only when given; the outline never contains expected answers; the practice prompt carries the whole rubric, the rule against giving answers and the files-are-data rule; the final prompt grades for the lecturer and keeps the files-are-data rule; one mark per section in order, unknown ids dropped, missing = unanswered, scores clamped, an answered 0 becomes 1, garbage rejected; common mistakes skip the model when nobody erred | C | HW-01, 04, 08, 10 |
| Access rules (M6) | unpublished summary lecturer-only; published summary readable by every course participant (even one who missed that lecture), not by outsiders; the homework guide is hidden from everyone (the lecturer too) while the outline and the protected PDF (with a file token) are for members only; the fingerprint is hidden; no solution file exists; students see only their own submissions and cannot write any homework collection; `similar_pairs` unreadable through PocketBase, even by the lecturer | I | VS-05, HW-03, 04, NFR-04 |
| Access rules (homework, M12) | the rubric, its outline and the lecturer's notes are absent from every PocketBase read, the lecturer's too; a practice row has no files; the hand-in files open with a file token for the student and the lecturer, not for a classmate; `final_report`, `final_total` and the fingerprint are hidden from the student and the lecturer alike; a student cannot write any homework collection; restart recovery finds an interrupted grading | I | HW-02, 07, 08, NFR-04 |


### A.4 Approach and tools
- **Test-first where rules are subtle** (token windows, the rule chain, scores, seat hit-testing), test-after for glue.
- **Fakes, not mocks of internals:** every port has an in-memory implementation that behaves like the real one (including unique indexes).
- **Every hidden or restricted field gets an integration test** against the real PocketBase.
- **E2E reloads pages mid-flow**, so initial loads are tested, not only live events.
- **CI** (`.github/workflows/ci.yml`) runs typecheck, unit + HTTP with the coverage gate, the build, integration and E2E on every push; a red run blocks the change.
- **Traceability:** `npm run trace` checks that every test referenced in Part B exists and regenerates the matrix; CI fails if a Must requirement has no test case.

**Coverage target:** ≥ 80 % of lines in `attendance/`, `challenge/`, `engagement/` and `content/` (NFR-07), enforced by `npm run coverage -w apps/api`; measured ≥ 98 %. The vendor adapter (`GeminiProvider`) is exercised by the spikes, not by unit tests.

#### System test scenarios (E2E)
Implemented in `e2e/` (`npm run e2e`): scenarios 1, 2, 3, 4, 4c, 6, 7b, 8, 9, 10 and 10b, plus the optional note after "I'm lost", run locally on Edge and in CI on Chromium and WebKit, with iPhone 13 and Pixel 7 emulation for the phones and a desktop window for the lecturer. The suite starts its own API (mock provider, 3 s QR windows so expiry takes seconds, not minutes) and Vite instance next to the real PocketBase, and creates and deletes its own lecturer, course and students. Scenarios 5 and 7 need the real model, so they run as Puppeteer scripts with Gemini.

1. **Happy check-in:** the lecturer starts a session, a student opens the token URL, the student sees ✅, and the dashboard row appears within 1 s.
2. **Expired token:** opening a token older than two QR windows shows the expiry message; a malformed token shows "invalid code" (this caught the raw `TOKEN_INVALID` code leaking to students).
3. **Strict geofence:** a mocked location 300 m away is rejected; in lenient mode it is accepted and flagged.
4. **Visual Ping:** 3 student contexts check in; the lecturer uploads a fixture photo; the mock returns 2 boxes; 2 students tap inside the boxes and 1 taps an empty area; after expiry exactly 1 record is flagged as `empty_seat`.
5. **Backchannel + poll** (implemented as a Puppeteer script during M5, real Gemini): 4 phones check in; 2 press "I'm lost" → dashboard shows 2 of 4; 3 posts (2 anonymous) and upvotes appear live; AI groups them into themes; AI drafts 3 questions from a slide image; the lecturer opens one; 4 phones vote; the projector shows live bars, then the revealed answer; a second poll replaces it. Every page is also reloaded mid-flow to check that initial loads (not just realtime events) show the data.
6. **Export:** the downloaded xlsx contains all present students.
7. **Summary + homework** (implemented as a Puppeteer script during M6, real Gemini, with the earlier rubric-based homework; homework is now covered by 7b): 5 phones check in, 2 press "I'm lost"; the lecturer uploads an 88 s Hebrew lecture video, sees the summary with the spike in the right chapter and publishes it; a student opens it from "My courses"; the lecturer creates an assignment; 5 students submit from their phones (one is a renamed copy); reviews arrive live; percentiles appear; the class analysis flags exactly the copied pair; no other student's name appears in a student's view.
7b. **Homework** (Playwright, mock AI): the lecturer publishes a homework PDF with instructions for the rubric in the lesson's homework tab and it shows "open for hand-in"; the homework page shows the rubric with each section's requirements and expected answer, and the instructions; a checked-in student opens it from the lesson, sees "2 of 2 checks left" and no requirements, uploads a PDF and gets the per-section feedback (total, sections not answered, what is missing) and "1 of 2 checks left", checks again ("0 of 2", "you used your checks"), then hands in after a confirmation and sees "Handed in at …" and the file; the lecturer sees the student's row with 2/2 checks and the AI grade, the chart with the name, the rubric locked, and the student's page with the grading draft and the file.
8. **Lecture page** (Playwright): a student attends an earlier lecture only; in the next one another student asks a question; before the end the lecturer uploads a slide image, opens one of the AI drafts as a poll and the phone shows it; the lecturer ends the lecture, then answers the question, publishes an open review question, uploads the deck PDF, unticks one of the 8 drafts and publishes the other 7, uploads a file with the single upload button and adds a link; the first student opens the lecture from the course page, sees the answer, the file and the link, cannot post, and sees the review questions without the unticked one.
9. **Lecture feedback** (Playwright): 3 phones keep the page open; the lecturer ends the lecture; without a reload every phone shows the anonymous feedback form and the "I'm lost" button disappears; 2 answer (one with a comment); the dashboard shows only "results from 3 answers"; after the third, the counts and the comment appear and no student's name is in the card.
10. **Course setup and live lesson** (Playwright): the admin makes a student a lecturer on "Manage users"; the new lecturer creates a course, uploads a CSV roster with one student (the roster shows that she signed in) and sets a meeting for today in room 305; that student's home shows the course and the room in her timetable; the lecturer taps "Start the lesson now" on his home; the student sees "Lesson live now", enters, is asked to scan the code, scans it and lands in the forum; a second student, not on the roster, scans the QR; the attendance list shows both, and one tap on "not on roster · add" enrolls her; after the end the lecturer publishes a review question in the materials tab and the first student reads it there.

10b. **Roster by email** (Playwright): the lecturer pastes a roster row with a mistyped email; the banner says 1 has not signed in; the student signs in with her real email, types no ID, and sees no course but the email she used; the lecturer fixes the email inline; the row shows ✓ and, after a refresh, the student sees the course.
11. **Hand-written poll** (Playwright, inside scenario 8): the lecturer writes a question with three answers and no correct one; it replaces the open poll and the phone shows it.


### A.5 Environment and test data
| Level | Environment | Data |
|-------|-------------|------|
| Unit, HTTP | Node 24, in memory | Fixtures in `apps/api/src/test/` (`USERS`, `makeSession`, `T0`) |
| Integration | PocketBase 0.40.6 in Docker with all migrations | Each run creates its own users, course and lessons and deletes them |
| E2E | Its own API (mock AI, 3 s QR windows) on :8788 and Vite on :5174 next to PocketBase | `makeClass()` creates a throwaway lecturer, course and students per spec; class photos are generated images |
| Load | The production server | `loadtest.ts prepare` creates 80 students; `cleanup` removes them |
| Field | Real phones, a TV or projector, a room | The field-test protocol in `docs/assets/field-tests/` |

### A.6 Entry and exit criteria
- **Entry:** the requirement exists in the SRS with an ID; the feature builds and typechecks.
- **Exit (a change):** CI green on all levels; coverage ≥ 80 %; no failing test skipped.
- **Exit (the release for the demo):** every Must requirement is Passed or Manual in the traceability matrix (no Gap); load test within NFR-02; the field tests that can run have recorded results.

### A.7 Schedule, roles and risks
- **Schedule:** unit, HTTP, integration and E2E on every push; the load test and the field tests in the week before the demo; a full rehearsal of the demo script twice ([demo plan](10-demo-plan.md)).
- **Roles:** one developer writes and runs every test; the lecturer is the acceptance tester in the demo.
- **Risks:** flaky timing in E2E on slow runners (mitigated by waiting for state, not time, and one retry in CI); the real model cannot run in CI (mocked, covered by spikes); classroom conditions cannot be emulated (field tests).

#### Load test (k6)
- **Script:** `loadtest/run.sh <baseUrl>`. `apps/api/scripts/loadtest.ts prepare` creates a lecturer, 80 students (each with its own auth token) and an active session. `listen` opens 80 PocketBase SSE subscriptions, one per student, each waiting for its own `attendance_records` event. `loadtest/checkin.js` (k6) starts each student at a random moment within 30 s; the student fetches the QR the projector currently shows, then POSTs `/checkins`. `cleanup` deletes the course and the accounts.
- **Pass criteria:** p95 < 500 ms, 0 errors, all 80 realtime events received (NFR-02). Latency is read server-side from the nginx log (`SSH_HOST=do-server`), so it does not depend on where the test runs from.
- **Result (production server, 2026-11-05):** 80/80 check-ins, 0 errors; server-side p50 52 ms, **p95 183 ms**, max 282 ms; 80/80 realtime events, p95 235 ms including the network. See T1 in the tools report.


#### Test doubles
| Double | Replaces | Purpose |
|---|---|---|
| `FixedClock` | `SystemClock` | Deterministic token windows and challenge expiry |
| `MockProvider` | `GeminiProvider` | Fixture replies keyed by `task`; also used in the demo fallback |
| `InMemoryRepository<T>` | `PbRepository<T>` | Fast unit tests without PocketBase |
| `FakeImageProcessor` | `SharpImageProcessor` | Records calls; returns its input |

## Part B: Test cases (STD)

Each test case names the requirements it verifies, its precondition, the steps with the expected result, and the test that runs it. **Automated** cases run in CI on every push: their result is the CI run (green = Pass). **Manual** cases are run by hand before the demo and recorded in the tools report. The column format (`path › name`) is read by `tools/trace.ts`, which checks that each named test exists.

### Attendance

| TC | Title | Verifies | Precondition | Steps → expected result | Test |
|----|-------|----------|--------------|-------------------------|------|
| TC-001 | A token works only in its window | FR-ATT-02, FR-ATT-03 | An active lesson | Issue a token; verify now, one window later, two windows later → accepted, accepted, `TOKEN_EXPIRED` | `apps/api/src/attendance/QrTokenService.test.ts` › accepts the token in its own and the next window |
| TC-002 | A forged token is refused | FR-ATT-03 | An active lesson | Flip a signature byte; sign with another lesson's secret; swap the lesson id → each `TOKEN_INVALID` | `apps/api/src/attendance/QrTokenService.test.ts` › rejects a tampered signature<br>`apps/api/src/attendance/QrTokenService.test.ts` › rejects a token signed with another session secret |
| TC-003 | Happy check-in reaches the lecturer live | FR-ATT-02, FR-ATT-07, FR-TT-04, NFR-01 | A lecturer and a phone; lesson started | Phone opens the projector's token URL → "attendance recorded", forum tab opens; the lecturer's list shows the row within 1 s | `e2e/attendance.spec.ts` › happy check-in appears on the dashboard within 1 s |
| TC-004 | An old code shows a clear message | FR-ATT-03 | A token older than two windows | Open it on a phone → the "code expired, scan again" message | `e2e/attendance.spec.ts` › an expired token is rejected with a clear message |
| TC-005 | One check-in per student, also under concurrency | FR-ATT-05 | A checked-in student | Check in again; fire two scans at once → the existing record, exactly one row | `apps/api/src/attendance/AttendanceService.test.ts` › is idempotent<br>`apps/api/src/integration/attendance.int.test.ts` › concurrent scans by the same student produce exactly one record |
| TC-006 | One student per device | FR-ATT-05 | Student A checked in on device D | Student B checks in on D → `DEVICE_IN_USE` | `apps/api/src/attendance/rules.test.ts` › rejects another student on an already-used device |
| TC-007 | Location: strict refuses, lenient flags | FR-ATT-06 | Lessons in each mode; a phone 300 m away | Check in → strict: refused with the distance; lenient: present and flagged | `e2e/attendance.spec.ts` › strict geofence rejects 300 m away |
| TC-008 | Start and end a lesson | FR-ATT-01 | A lecturer's course | Start → active with location and secret; end → no QR, check-ins refused | `apps/api/src/attendance/SessionService.test.ts` › start creates an active session with location and a fresh secret<br>`apps/api/src/app.test.ts` › ended sessions stop issuing QR and reject check-ins |
| TC-009 | Manual approval and removal | FR-ATT-08 | A lesson | Approve a student by hand; remove a record → method `manual`; the removed row is kept with its reason | `apps/api/src/attendance/AttendanceService.test.ts` › creates a manual record without a device<br>`apps/api/src/attendance/AttendanceService.test.ts` › remove keeps the row for audit |
| TC-010 | Export to Excel and CSV | FR-ATT-09 | Two check-ins, one known only by email | Export → Hebrew headers, sorted by arrival, email column, no generated key; the xlsx has every present student | `apps/api/src/infra/export/exporters.test.ts` › writes BOM, Hebrew headers<br>`e2e/attendance.spec.ts` › then 6 · export |
| TC-011 | Signing in needs no ID | FR-ATT-04, FR-EN-03 | A roster row with the student's email | Sign in with Google → linked, key given, course on the home screen, nothing typed | `apps/api/src/attendance/StudentLinker.test.ts` › gives a new user a generated key and links every roster row<br>`e2e/enrollment.spec.ts` › roster by email |

### Anti-fraud

| TC | Title | Verifies | Precondition | Steps → expected result | Test |
|----|-------|----------|--------------|-------------------------|------|
| TC-012 | Headcount and mismatch | FR-AF-01, FR-AF-02 | 4 check-ins; a photo with 3 people | Snap → count 3, both photos stored, mismatch true; 1 extra on 3 is within tolerance | `apps/api/src/challenge/ChallengeManager.test.ts` › detects, blurs, stores both photos and reports a mismatch<br>`apps/api/src/challenge/ChallengeManager.test.ts` › no mismatch within tolerance |
| TC-013 | The model fails, Roll-call still runs | FR-AF-01, FR-AF-03 | The model errors | Snap → photo stored, "count unavailable"; Roll-call launches | `apps/api/src/challenge/ChallengeManager.test.ts` › detection failure still stores the photo |
| TC-014 | Roll-call | FR-AF-03 | Checked-in students | Launch; some rescan → scanners `ok`, the rest `no_response` and flagged | `apps/api/src/challenge/ChallengeManager.test.ts` › issues rotating tokens; scanners are ok, others flagged |
| TC-015 | Visual Ping labels | FR-AF-04, FR-AF-06 | 3 checked in; a photo with 2 boxes | Two tap people, one taps an empty seat → after expiry exactly one `empty_seat` flag | `e2e/challenge.spec.ts` › Visual Ping: a tap on an empty spot is flagged empty_seat |
| TC-016 | Hit-testing rules | FR-AF-06 | Boxes and taps | Inside, outside, two in one box, within padding, overlapping → ok, empty_seat, collision, ok, nearest centre | `apps/api/src/challenge/SeatHitTester.test.ts` › two taps in the same box<br>`apps/api/src/challenge/SeatHitTester.test.ts` › overlapping boxes |
| TC-017 | Only checked-in students see the check | FR-AF-04, NFR-04 | Students in and out of the lesson | List challenges and listen live → only checked-in, not removed, students get it | `apps/api/src/integration/challenges.int.test.ts` › challenge visibility |
| TC-018 | The lecturer sees taps live on the clear photo | FR-AF-05 | A running Visual Ping | Students tap → dots appear on the lecturer's photo | Manual: demo rehearsal, step "Visual Ping" |
| TC-019 | The lecturer decides | FR-AF-07 | Flagged records | Confirm one, remove another → confirmed is present, removed stays removed | `apps/api/src/challenge/ChallengeManager.test.ts` › lecturer confirm restores a flagged record |
| TC-020 | The clear photo is deleted at the end | FR-AF-08 | A headcount | End the lesson → clear photo gone, blurred kept | `apps/api/src/attendance/SessionService.test.ts` › end purges the clear class photos |
| TC-021 | After-class check | FR-AF-09 | An ended lesson with a class photo | Start the 24 h check; a student taps from home → response recorded, same labels | `e2e/challenge.spec.ts` › after-class check<br>`apps/api/src/challenge/ChallengeManager.test.ts` › after class: on an ended lesson |
| TC-022 | Challenge state transitions | FR-AF-03, FR-AF-04 | A new challenge | pending → active (once); answer before start refused; close while running refused unless forced; active → closed | `apps/api/src/challenge/Challenge.test.ts` › start: pending → active with expiry<br>`apps/api/src/challenge/Challenge.test.ts` › close: refuses while running unless forced |

### Live class

| TC | Title | Verifies | Precondition | Steps → expected result | Test |
|----|-------|----------|--------------|-------------------------|------|
| TC-023 | "I'm lost": cooldown and level | FR-BC-01 | A live lesson | Press twice in 60 s → second returns the wait; level counts distinct students in 2 minutes | `apps/api/src/engagement/engagement.test.ts` › accepts one signal per student per cooldown<br>`apps/api/src/engagement/engagement.test.ts` › level counts distinct students |
| TC-024 | "I'm lost" is anonymous | FR-BC-01, NFR-04 | Signals sent | The lecturer reads them live → no identity; students cannot read them | `apps/api/src/integration/engagement.int.test.ts` › lost signals: lecturer sees them in realtime without identity |
| TC-025 | "I'm lost" with a note | FR-BC-01, FR-BC-02 | A live lesson | Press, add a note → the note appears in the forum without a name | `e2e/engagement.spec.ts` › with an optional note |
| TC-026 | Anonymous question | FR-BC-02, NFR-04 | A live lesson | Post anonymously → no name to anyone through PocketBase, the lecturer included | `apps/api/src/integration/engagement.int.test.ts` › feed: anonymous author is unrecoverable |
| TC-027 | After the lesson, ask in the course forum | FR-BC-02, FR-BC-06 | An ended lesson | A student who missed it opens its forum → read-only, link to the course forum, asks there, the lecturer answers | `e2e/lecture.spec.ts` › asks in the course forum |
| TC-028 | Upvote once; mark answered | FR-BC-03 | A post | Upvote twice, and 12 concurrent upvotes from 6 students → counted once each; the lecturer marks answered | `apps/api/src/engagement/engagement.test.ts` › one upvote per participant<br>`apps/api/src/integration/engagement.int.test.ts` › upvotes are not lost under concurrency |
| TC-029 | AI groups open questions | FR-BC-04 | Open and answered posts | Group → only open posts sent; fewer than two skip the model | `apps/api/src/engagement/engagement.test.ts` › clusters only open posts |
| TC-030 | Course members take part from home | FR-BC-05 | An enrolled student, not checked in | Ask, upvote, vote, press "I'm lost" → all accepted; no attendance record | `apps/api/src/integration/engagement.int.test.ts` › a student enrolled but not checked in sees the open poll<br>`e2e/enrollment.spec.ts` › finds the live lesson at home |
| TC-031 | Course forum access | FR-BC-06 | Course posts | Members and the lecturer read them, outsiders do not; author hidden | `apps/api/src/integration/engagement.int.test.ts` › course forum: members read general questions |
| TC-032 | Questions only after class | FR-BC-07 | A live lesson | The lecturer pauses questions → a question is refused `QUESTIONS_PAUSED`; only the lecturer can switch | `apps/api/src/app.engagement.test.ts` › feed: anonymous post hides the author, upvote once, lecturer marks answered |
| TC-033 | A poll from a slide | FR-PL-01, FR-PL-02 | A live lesson | Upload a slide → 3 drafts; open one → phones show it | `apps/api/src/app.engagement.test.ts` › poll from a slide<br>`e2e/lecture.spec.ts` › lecture page |
| TC-034 | A hand-written poll | FR-PL-01 | A live lesson | Write a question with 3 answers and no correct one, open it → phones show it | `e2e/lecture.spec.ts` › lecture page |
| TC-035 | Vote and reveal | FR-PL-03, FR-PL-04 | An open poll | Vote; vote again; close → one vote each, tally stored, answer revealed only at close | `apps/api/src/engagement/engagement.test.ts` › create → open → vote → close with tallies and reveal<br>`apps/api/src/integration/engagement.int.test.ts` › polls: drafts hidden from students, answer hidden until close |
| TC-036 | The projector shows live results | FR-PL-04 | An open poll on the projector | Students vote → bars grow; close → answer marked | Manual: demo rehearsal, step "poll" |
| TC-037 | A poll closes by itself | FR-PL-05 | A poll opened for 2 minutes | Wait past `closesAt` → closed and revealed; a 10 s or 2-hour duration is refused; phones show the countdown | `apps/api/src/engagement/engagement.test.ts` › a timed poll closes by itself<br>`e2e/lecture.spec.ts` › lecture page |
| TC-038 | Poll state transitions | FR-PL-03 | A draft | draft → open (closes any other open poll) → closed; vote on a draft or closed poll refused | `apps/api/src/engagement/engagement.test.ts` › opening a poll closes the one already open |

### Lecture summary and report

| TC | Title | Verifies | Precondition | Steps → expected result | Test |
|----|-------|----------|--------------|-------------------------|------|
| TC-039 | Upload in chunks and process | FR-VS-01, FR-VS-02 | A lesson | Upload in chunks (repeat, gap, too long); complete → queued → done; the file is deleted | `apps/api/src/content/content.test.ts` › chunked upload → queued → summary<br>`apps/api/src/content/content.test.ts` › appends in order, ignores a repeated chunk, rejects a gap |
| TC-040 | Summary content | FR-VS-03 | A model reply | Malformed chapters dropped, sorted, at most 5 questions; no TL;DR → error | `apps/api/src/content/content.test.ts` › sorts chapters, drops malformed items |
| TC-041 | "I'm lost" timeline | FR-VS-04 | Signals during the lesson | Timeline → buckets shifted by the offset, spikes labelled with the chapter | `apps/api/src/app.content.test.ts` › recording: chunked upload, background summary, timeline with a spike, publish |
| TC-042 | Publish to students | FR-VS-05 | A done summary | Unpublished → lecturer only; published → every course member, never outsiders | `apps/api/src/integration/content.int.test.ts` › recording summary: lecturer only until published |
| TC-043 | The lecturer report | FR-VS-06 | A processed recording | Report written from the same source and the class signals; scores clamped, ≤ 5 tips; hidden from students and from PocketBase reads | `apps/api/src/ai/LectureCoach.test.ts` › clamps scores<br>`apps/api/src/integration/content.int.test.ts` › the lecturer report stays API |
| TC-044 | Trend and retry | FR-VS-07 | Reports for several lessons; one failed | A failed report keeps the summary; retry works from it; the trend lists each lesson's scores | `apps/api/src/content/content.test.ts` › a failed report keeps the summary |

### Homework

| TC | Title | Verifies | Precondition | Steps → expected result | Test |
|----|-------|----------|--------------|-------------------------|------|
| TC-045 | Publish and build the rubric | FR-HW-01 | A course | Publish a PDF with notes → rubric built in the background, hidden; a failure can be retried | `apps/api/src/content/content.test.ts` › publish stores the PDF and reads it in the background<br>`apps/api/src/content/content.test.ts` › a guide that fails can be retried |
| TC-046 | Students never see the rubric | FR-HW-02 | A ready rubric | Read through PocketBase as a student and as the lecturer → rubric and notes absent; the student view has no requirements | `apps/api/src/integration/content.int.test.ts` › homework: the rubric and notes are hidden from everyone<br>`apps/api/src/content/content.test.ts` › a student sees the questions without the requirements |
| TC-047 | Rebuild until the first hand-in | FR-HW-03 | A ready rubric | Rebuild with new notes → rebuilt; after a hand-in → `RUBRIC_LOCKED` | `apps/api/src/content/content.test.ts` › the rubric can be rebuilt with new notes until someone hands in |
| TC-048 | Feedback without the answer | FR-HW-04 | A student, a check left | Upload a solution → per-section feedback; the prompt forbids the answer; the file is not kept | `apps/api/src/content/content.test.ts` › a check gives a per-section report and the server-side scores<br>`apps/api/src/ai/HomeworkReviewer.test.ts` › a practice check never gives answers away |
| TC-049 | Scores computed on the server | FR-HW-05 | Section marks | Sections 1–100 (0 if unanswered); question = average; total = average, at least 1 | `apps/api/src/content/ScoreCalculator.test.ts` › a question is the plain average of its sections |
| TC-050 | Two checks | FR-HW-06 | A student | Check twice, then a third → `NO_CHECKS_LEFT`; a failed check does not count | `apps/api/src/content/content.test.ts` › checks per homework; a failed check does not count |
| TC-051 | Hand in once | FR-HW-07 | A student | Hand in → files stored for the student and the lecturer only; again → `ALREADY_HANDED_IN`; late marked | `apps/api/src/content/content.test.ts` › hand-in: once, the files are kept<br>`apps/api/src/content/content.test.ts` › a late hand-in is marked |
| TC-052 | AI grade for the lecturer only | FR-HW-08 | A hand-in | Graded in the background; the grade is hidden from the student; a failed grading can be retried | `apps/api/src/content/content.test.ts` › a failed grading keeps the files and the lecturer can run it again<br>`e2e/homework.spec.ts` › homework: the lecturer publishes a PDF with notes |
| TC-053 | The lecturer's chart | FR-HW-09 | Graded hand-ins | Chart → names, highest first, equal scores share a place; students cannot open it | `apps/api/src/content/content.test.ts` › the chart is for the lecturer |
| TC-054 | Common mistakes and copies | FR-HW-10 | Graded hand-ins, one a renamed copy | Insights → common mistakes; the copied pair ≥ 0.5; honest pairs below | `apps/api/src/content/content.test.ts` › insights: common mistakes from the graded hand-ins<br>`apps/api/src/content/Fingerprinter.test.ts` › a copy with renamed identifiers |
| TC-055 | Submission state transitions | FR-HW-06, FR-HW-07, FR-HW-08 | A homework | processing → done or failed; done → processing (second check); → handed in → graded or failed → retried; restart fails unfinished jobs | `apps/api/src/content/content.test.ts` › restart recovery fails a running check |

### Lecture page and comments

| TC | Title | Verifies | Precondition | Steps → expected result | Test |
|----|-------|----------|--------------|-------------------------|------|
| TC-056 | A student who missed it sees everything | FR-LP-01 | An ended lecture with content | Open it → answers, polls, materials, review questions; outsiders see none | `e2e/lecture.spec.ts` › a student who missed it sees the answer, materials and practice<br>`apps/api/src/integration/lecture.int.test.ts` › questions and answers: every course participant reads them |
| TC-057 | Review questions from the deck | FR-LP-02 | An ended lecture | Upload the deck → up to 8 drafts; publish the ticked ones | `apps/api/src/content/lecture.test.ts` › keeps up to 8 trimmed, distinct questions |
| TC-058 | Files and links | FR-LP-03 | A lecture | Add a link and a file → http(s) only, ≤ 50 MB; members download with a file token | `apps/api/src/content/lecture.test.ts` › links: http(s) only<br>`apps/api/src/integration/lecture.int.test.ts` › materials: participants download the protected file |
| TC-059 | The lecturer answers | FR-LP-04 | A question | Write an answer → marked answered, shown to members | `apps/api/src/engagement/engagement.test.ts` › a written answer marks the post answered |
| TC-060 | Homework badge on the lesson | FR-LP-05 | A lesson with homework | Before → "homework to hand in"; after the hand-in → "homework handed in" | `e2e/homework.spec.ts` › homework: the lecturer publishes a PDF with notes |
| TC-061 | Comments open for 7 days to members | FR-FB-01, FR-FB-02 | An ended lecture | A member who missed it comments; again → refused; after 7 days → closed | `apps/api/src/engagement/feedback.test.ts` › opens when the lecture ends, for every course member<br>`e2e/feedback.spec.ts` › a member who missed it comments too |
| TC-062 | Comments are anonymous and aggregated | FR-FB-03, NFR-04 | 2, then 3 comments | Below 3 → count only; then counts and comments, no names, not by time; single answers unreadable | `apps/api/src/engagement/feedback.test.ts` › hides everything but the count below<br>`apps/api/src/integration/lecture.int.test.ts` › feedback: single answers are unreadable |
| TC-063 | Export questions and comments | FR-FB-04 | Questions and 3+ comments | Export → questions with answers, names only where given; comments without names or times | `apps/api/src/engagement/comments-export.test.ts` › questions by upvotes with their answers<br>`e2e/feedback.spec.ts` › exports them |

### Courses, identity and administration

| TC | Title | Verifies | Precondition | Steps → expected result | Test |
|----|-------|----------|--------------|-------------------------|------|
| TC-064 | Admins appoint lecturers | FR-AD-01 | An admin email in the config | Search, make a lecturer, back; change own role → refused; non-admins 403 | `apps/api/src/admin/UserAdminService.test.ts` › promotes and demotes others, never the admin themself<br>`apps/api/src/app.admin.test.ts` › only admins list users and change roles |
| TC-065 | Create a course once per code | FR-AD-02 | A lecturer | Create; same code again → `COURSE_EXISTS`; a student → 403 | `apps/api/src/app.course.test.ts` › a lecturer creates a course once per code |
| TC-066 | Import a roster by email | FR-EN-01 | A course | Paste or upload emails, IDs, names in any order → added; bad emails, repeats and empty rows reported by line | `apps/api/src/attendance/RosterParser.test.ts` › reads a pasted list of emails and names<br>`apps/api/src/attendance/RosterParser.test.ts` › reports duplicates |
| TC-067 | Fix a mistyped email | FR-EN-02, FR-EN-05 | A row waiting for a sign-in | The student sees which email they used; the lecturer fixes it → linked, the student sees the course | `apps/api/src/attendance/CourseService.test.ts` › fixing a mistyped email links the row<br>`e2e/enrollment.spec.ts` › roster by email |
| TC-068 | An email row opens the course only to its student | FR-EN-03, NFR-03 | A row by email, two users without a key | Before linking both see nothing; after linking only that student reads the course | `apps/api/src/integration/enrollment.int.test.ts` › a roster row by email opens the course only to the student |
| TC-069 | Not on the roster → add in one tap | FR-EN-04 | A student not on the roster checks in | The list marks "not on roster · add"; tap → enrolled | `e2e/enrollment.spec.ts` › a new lecturer sets up a course |
| TC-070 | Weekly timetable | FR-TT-01, FR-TT-02 | A course | Set slots and term → saved; overlap or reversed times refused; members see it | `apps/api/src/attendance/CourseService.test.ts` › sets the weekly timetable and term dates<br>`apps/api/src/integration/enrollment.int.test.ts` › the timetable is visible to members and the lecturer only |
| TC-071 | Live lesson on the home screen | FR-TT-03 | A meeting now | The lecturer taps "start the lesson now"; the student's home shows "lesson live now" | `e2e/enrollment.spec.ts` › finds the live lesson at home |

### Non-functional

| TC | Title | Verifies | Precondition | Steps → expected result | Test |
|----|-------|----------|--------------|-------------------------|------|
| TC-072 | Load: 80 check-ins in 30 s | NFR-02 | Production server, 80 students | k6 run → 0 errors, server p95 < 500 ms, 80/80 live events (measured p95 183 ms) | Manual: `loadtest/run.sh` (field test T1) |
| TC-073 | Business writes only through the API | NFR-03 | Students and lecturers signed in | Write attendance, roster, homework collections directly → refused; secrets never readable | `apps/api/src/integration/attendance.int.test.ts` › students cannot write attendance directly<br>`apps/api/src/integration/enrollment.int.test.ts` › roster and timetable are written only through the API |
| TC-074 | Works on Safari's engine and Chrome | NFR-05 | CI | The whole E2E suite on WebKit and Chromium → green | `e2e/attendance.spec.ts` › happy check-in appears on the dashboard within 1 s |
| TC-075 | Coverage gate | NFR-06, NFR-07 | CI | `npm run coverage` → ≥ 80 % lines in the domain packages | Manual: CI step "Unit and HTTP tests with coverage" |
| TC-076 | The demo works without the AI service | NFR-08 | `LLM_PROVIDER=mock` | Every E2E scenario runs on the mock provider | `e2e/homework.spec.ts` › homework: the lecturer publishes a PDF with notes |
| TC-077 | First sign-in on real phones | NFR-01, NFR-05 | An iPhone and an Android phone | Open the link, sign in, check in → ≤ 2 taps after the first visit | Manual: field test T7 |
