# Testing Strategy: ClassPulse

## 1. Levels
| Level | Tool | Scope | When |
|---|---|---|---|
| Unit | Vitest | Every domain class in `apps/api/src`. No network, no PocketBase. Uses `FixedClock`, `MockProvider` and `InMemoryRepository` fakes | Every commit |
| Contract | Vitest + JSON Schema | AI services: LLM output is validated against the schema, and malformed output raises `LLMOutputError`. Recorded real Gemini replies serve as fixtures | Every commit |
| Integration | Vitest + PocketBase in Docker | `Pb*Repository` classes, collection access rules (e.g. a non-checked-in student cannot list challenges) and migrations | Before merge |
| E2E | Playwright (iPhone and Pixel emulation) | Full user flows through the web app, the API and PocketBase, with `LLM_PROVIDER=mock` | Before each milestone demo |
| Load | k6 | 80 check-ins within 30 s; 80 realtime subscribers | Milestone 3 and before the demo |
| Manual / field | Real phones in a classroom | QR from the back row, GPS, blur, the whole demo script | Dry run one week before the demo |

**Coverage target:** ≥80% of lines in `attendance/`, `challenge/`, `engagement/` and `content/` (NFR-07). Measured with `npm run coverage -w apps/api` (the threshold fails the run below 80%): **99.1% of lines**, 96.6% of statements, 88.5% of branches (2026-11-05). AI vendor adapters (`GeminiProvider`, `ClaudeProvider`) are covered by contract tests, not unit tests.

## 2. Test design per class

Coverage key: **U** = unit test, **C** = contract test, **I** = integration test.

### attendance/
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
| `SessionService` | `start` stores location and generates a secret; `end` rejects further tokens and purges clear photos | U | ATT-01, AF-08 |
| `AttendanceExportService` + `XlsxExporter` / `CsvExporter` | golden file: Hebrew names and the column order are correct | U | ATT-09 |
| `GoogleSheetsExporter` | writes rows to a test spreadsheet | I | ATT-09 |

### challenge/
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

### engagement/ and content/
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
| `FeedbackService` | not open while the lecture runs; open for 24 h after the end, only to those checked in; one answer per student, concurrent duplicates count once; unknown option rejected; below 3 answers only the count; then counts and comments with no identity and no time order | U | FB-01..03 |
| `FeedService.answer` | a written answer marks the post answered; clearing the text keeps the flag | U | LP-04 |
| Access rules (M9) | single feedback answers are unreadable through PocketBase by everyone, the lecturer and the author included (403), and cannot be written directly; a student who was not checked in cannot answer | I | FB-01, 03, NFR-04 |
| Access rules (M8) | a student who missed the lecture reads questions with answers (author still hidden), closed polls with results but never open ones, review questions, and downloads materials only with a file token; outsiders see none of it; review questions cannot be written directly | I | LP-01..04, NFR-04 |
| `LectureSummarizer` | chapters sorted, malformed and duplicate-time chapters dropped, questions capped at 5; empty TL;DR or no chapters → `LLMOutputError`; media goes as an attachment, a transcript as text | C | VS-03 |
| `PercentileCalculator` | mid-rank with ties, n = 1, min and max, empty population | U | HW-03 |
| `Fingerprinter` | renamed copy with an added comment → 1.0; two independent solutions < 0.4; token normalisation; prose copy detected, different prose not; sketch bounded at 256 | U | HW-04 |
| `TextExtractor` | real PDF text layer read; corrupt PDF → `UNREADABLE_FILE`; unsupported extension; scanned (empty) → `EMPTY_FILE` | U | HW-02 |
| `SimilarityAnalyzer` | each pair above the threshold once, most similar first | U | HW-04 |
| `HomeworkAnalysisService` | rubric validation and ids; non-participant rejected; late flag; resubmission replaces and is blocked while reviewing; weighted total; failed review marked; percentiles hidden while n < 5; insights find the copied pair; restart recovery | U | HW-01..04 |
| `HomeworkReviewer` | every criterion scored exactly once, scores clamped, unknown ids ignored; submission wrapped as data (prompt-injection guard); common mistakes skip the model when nobody erred and are written in the assignment's language | C | HW-02, 03 |
| Access rules (M6) | unpublished summary lecturer-only; published summary readable by every course participant (even one who missed that lecture), not by outsiders; text extract and fingerprint hidden; students see only their own submissions and can download their own file; `similar_pairs` unreadable through PocketBase, even by the lecturer | I | VS-05, HW-03, 04, NFR-04 |

## 3. E2E scenarios (Playwright, `LLM_PROVIDER=mock`)
Implemented in `e2e/` (`npm run e2e`): scenarios 1, 2, 3, 4, 6, 8 and 9, plus the optional note after "I'm lost", run on Edge with iPhone 13 and Pixel 7 emulation for the phones and a desktop window for the lecturer. The suite starts its own API (mock provider, 3 s QR windows so expiry takes seconds, not minutes) and Vite instance next to the real PocketBase, and creates and deletes its own lecturer, course and students. Scenarios 5 and 7 need the real model, so they run as Puppeteer scripts with Gemini.

1. **Happy check-in:** the lecturer starts a session, a student opens the token URL, the student sees ✅, and the dashboard row appears within 1 s.
2. **Expired token:** opening a token older than two QR windows shows the expiry message; a malformed token shows "invalid code" (this caught the raw `TOKEN_INVALID` code leaking to students).
3. **Strict geofence:** a mocked location 300 m away is rejected; in lenient mode it is accepted and flagged.
4. **Visual Ping:** 3 student contexts check in; the lecturer uploads a fixture photo; the mock returns 2 boxes; 2 students tap inside the boxes and 1 taps an empty area; after expiry exactly 1 record is flagged as `empty_seat`.
5. **Backchannel + poll** (implemented as a Puppeteer script during M5, real Gemini): 4 phones check in; 2 press "I'm lost" → dashboard shows 2 of 4; 3 posts (2 anonymous) and upvotes appear live; AI groups them into themes; AI drafts 3 questions from a slide image; the lecturer opens one; 4 phones vote; the projector shows live bars, then the revealed answer; a second poll replaces it. Every page is also reloaded mid-flow to check that initial loads (not just realtime events) show the data.
6. **Export:** the downloaded xlsx contains all present students.
7. **Summary + homework** (implemented as a Puppeteer script during M6, real Gemini): 5 phones check in, 2 press "I'm lost"; the lecturer uploads an 88 s Hebrew lecture video, sees the summary with the spike in the right chapter and publishes it; a student opens it from "My courses"; the lecturer creates an assignment; 5 students submit from their phones (one is a renamed copy); reviews arrive live; percentiles appear; the class analysis flags exactly the copied pair; no other student's name appears in a student's view.
8. **Lecture page** (Playwright): a student attends an earlier lecture only; in the next one another student asks a question; before the end the lecturer uploads a slide image, opens one of the AI drafts as a poll and the phone shows it; the lecturer ends the lecture, then answers the question, publishes an open review question, uploads the deck PDF, unticks one of the 8 drafts and publishes the other 7, uploads a file with the single upload button and adds a link; the first student opens the lecture from the course page, sees the answer, the file and the link, cannot post, and sees the review questions without the unticked one.
9. **Lecture feedback** (Playwright): 3 phones keep the page open; the lecturer ends the lecture; without a reload every phone shows the anonymous feedback form and the "I'm lost" button disappears; 2 answer (one with a comment); the dashboard shows only "results from 3 answers"; after the third, the counts and the comment appear and no student's name is in the card.

## 4. Load test (k6)
- **Script:** `loadtest/run.sh <baseUrl>`. `apps/api/scripts/loadtest.ts prepare` creates a lecturer, 80 students (each with its own auth token) and an active session. `listen` opens 80 PocketBase SSE subscriptions, one per student, each waiting for its own `attendance_records` event. `loadtest/checkin.js` (k6) starts each student at a random moment within 30 s; the student fetches the QR the projector currently shows, then POSTs `/checkins`. `cleanup` deletes the course and the accounts.
- **Pass criteria:** p95 < 500 ms, 0 errors, all 80 realtime events received (NFR-02). Latency is read server-side from the nginx log (`SSH_HOST=do-server`), so it does not depend on where the test runs from.
- **Result (production server, 2026-11-05):** 80/80 check-ins, 0 errors; server-side p50 52 ms, **p95 183 ms**, max 282 ms; 80/80 realtime events, p95 235 ms including the network. See T1 in the tools report.

## 5. Test doubles
| Double | Replaces | Purpose |
|---|---|---|
| `FixedClock` | `SystemClock` | Deterministic token windows and challenge expiry |
| `MockProvider` | `GeminiProvider` | Fixture replies keyed by `task`; also used in the demo fallback |
| `InMemoryRepository<T>` | `PbRepository<T>` | Fast unit tests without PocketBase |
| `FakeImageProcessor` | `SharpImageProcessor` | Records calls; returns its input |
