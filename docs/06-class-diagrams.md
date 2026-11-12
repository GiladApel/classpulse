# Class Diagrams: ClassPulse API

Class and method names here are the contract for `apps/api/src`. One folder per package, one file per class.

**Design patterns used:**

| Pattern | Where |
|---|---|
| Strategy | `LLMProvider`, `GeofencePolicy`, `SpreadsheetExporter`, `ImageProcessor` |
| Factory | `LLMProviderFactory`, `GeofencePolicyFactory`, `ChallengeFactory` |
| Adapter | `N8nWebhookProvider` (n8n webhook → `LLMProvider`) |
| Chain of Responsibility | `CheckInRule[]` evaluated by `AttendanceService` |
| Template Method | `Challenge.start / respond / close` |
| State | `Challenge.status`: pending → active → closed |
| Repository | `Repository<T>` / `PbRepository<T>` |
| Observer | PocketBase realtime (subject) → web clients (observers) |
| Dependency Injection | `container.ts` composition root |

## 1. Domain model (entities)

```mermaid
classDiagram
  direction LR
  class User {
    +id: string
    +name: string
    +studentId: string
    +role: Role
  }
  class Course {
    +id: string
    +code: string
    +name: string
    +termStart: Date
    +termEnd: Date
  }
  class Enrollment {
    +studentNumber: string
    +name: string
    +addedAt: Date
  }
  class CourseSlot {
    +weekday: number
    +starts: string
    +ends: string
    +room: string
  }
  class Session {
    +id: string
    +title: string
    +status: SessionStatus
    +startedAt: Date
    +endedAt: Date
    +location: GeoPoint
    +geofenceMode: GeofenceMode
    +geofenceRadiusM: number
  }
  class AttendanceRecord {
    +id: string
    +deviceId: string
    +checkedInAt: Date
    +method: CheckInMethod
    +distanceM: number
    +geoFlag: boolean
    +status: AttendanceStatus
    +note: string
  }
  class Headcount {
    +id: string
    +peopleCount: number
    +confidence: number
    +boxes: Box[]
    +checkinsAtSnap: number
  }
  class ChallengeData {
    +id: string
    +type: ChallengeType
    +status: ChallengeStatus
    +expiresAt: Date
  }
  class ChallengeResponse {
    +studentId: string
    +tap: Point
    +rollcallTokenOk: boolean
    +verdict: Verdict
  }
  class LostSignal {
    +studentNumber: string
    +at: Date
  }
  class FeedPost {
    +id: string
    +text: string
    +anonymous: boolean
    +displayName: string | null
    +votes: number
    +answered: boolean
    +answer: string
  }
  class PostVote {
    +voterNumber: string
  }
  class Poll {
    +id: string
    +question: string
    +options: string[]
    +correctIndex: number | null
    +status: PollStatus
    +source: PollSource
    +results: PollResults
  }
  class PollVote {
    +studentNumber: string
    +optionIndex: number
  }
  class Recording {
    +id: string
    +kind: media | transcript
    +offsetSec: number
    +status: RecordingStatus
    +summary: LectureSummary
    +published: boolean
  }
  class Assignment {
    +id: string
    +title: string
    +dueAt: Date
    +guideStatus: GuideStatus
    +outline: GuideOutline
    -guide: ReviewGuide
  }
  class Submission {
    +id: string
    +status: SubmissionStatus
    +checkCount: number
    +report: HomeworkReport
    +total: number
    +late: boolean
  }
  class AssignmentInsights {
    +commonMistakes: CommonMistake[]
    +similarPairs: SimilarPair[]
  }
  class PracticeQuestion {
    +id: string
    +question: string
    +source: manual | ai
  }
  class LessonFeedback {
    +rating: FeedbackRating
    +comment: string
    +submittedAt: Date
  }
  class Material {
    +id: string
    +title: string
    +kind: file | link
    +url: string
    +filename: string
  }

  User "1" --> "*" Course : teaches
  Course "1" *-- "*" Session
  Session "1" *-- "*" AttendanceRecord
  User "1" --> "*" AttendanceRecord : attends
  Session "1" *-- "*" Headcount
  Headcount "1" --> "*" ChallengeData : triggers
  ChallengeData "1" *-- "*" ChallengeResponse
  Session "1" *-- "*" LostSignal
  Session "1" *-- "*" FeedPost
  FeedPost "1" *-- "*" PostVote
  Session "1" *-- "*" Poll
  Poll "1" *-- "*" PollVote
  Session "1" *-- "0..1" Recording
  Course "1" *-- "*" Assignment
  Assignment "1" *-- "*" Submission
  User "1" --> "*" Submission : submits
  Assignment "1" *-- "0..1" AssignmentInsights
  Session "1" *-- "*" PracticeQuestion
  Session "1" *-- "*" Material
  Session "1" *-- "*" LessonFeedback
  Course "1" *-- "*" Enrollment : roster
  Course "1" *-- "*" CourseSlot : weekly timetable
```

## 2. `ai/`: Strategy + Adapter + Factory

```mermaid
classDiagram
  direction TB
  class LLMProvider {
    <<interface>>
    +generateStructured~T~(req: StructuredRequest) Promise~T~
  }
  class GeminiProvider {
    -client: GoogleGenAI
    -model: string
    +generateStructured~T~(req) Promise~T~
    -toPart(file) Part «inline ≤15 MB, else Files API»
  }
  class ClaudeProvider {
    «planned»
    -client: Anthropic
    -model: string
    +generateStructured~T~(req) Promise~T~
  }
  class N8nWebhookProvider {
    «planned»
    -webhookUrl: string
    +generateStructured~T~(req) Promise~T~
  }
  class MockProvider {
    -fixtures: Map~string, Fixture~
    +generateStructured~T~(req) Promise~T~
  }
  class LLMProviderFactory {
    +create(cfg: AiConfig)$ LLMProvider
  }
  class StructuredRequest {
    +task: string
    +prompt: string
    +schema: JsonSchema
    +files: Attachment[]
  }
  class PeopleDetector {
    -llm: LLMProvider
    +detect(photo: Attachment) Promise~Detection~
  }
  class McqGenerator {
    -llm: LLMProvider
    +fromSlide(slide: Attachment) Promise~McqDraft[]~
  }
  class PracticeQuestionGenerator {
    -llm: LLMProvider
    +fromLecture(deck: Attachment) Promise~string[]~
  }
  class LectureSummarizer {
    -llm: LLMProvider
    +summarize(source: LectureSource) Promise~LectureSummary~
  }
  class HomeworkGuideGenerator {
    -llm: LLMProvider
    +fromHomework(pdf: Attachment) Promise~ReviewGuide~
    +validate(raw)$ ReviewGuide
    +outline(guide)$ GuideOutline
  }
  class HomeworkReviewer {
    -llm: LLMProvider
    +reviewSolution(guide: ReviewGuide, solution: Attachment[]) Promise~marks, mistakes~
    +validateSections(raw, guide)$ marks, mistakes
    +commonMistakes(perStudent: string[][], assignment) Promise~CommonMistake[]~
  }
  class FeedClusterer {
    -llm: LLMProvider
    +cluster(posts: FeedPost[]) Promise~Theme[]~
  }

  LLMProvider <|.. GeminiProvider
  LLMProvider <|.. ClaudeProvider
  LLMProvider <|.. N8nWebhookProvider
  LLMProvider <|.. MockProvider
  LLMProviderFactory ..> LLMProvider : creates
  LLMProvider ..> StructuredRequest
  PeopleDetector o-- LLMProvider
  McqGenerator o-- LLMProvider
  PracticeQuestionGenerator o-- LLMProvider
  LectureSummarizer o-- LLMProvider
  HomeworkGuideGenerator o-- LLMProvider
  HomeworkReviewer o-- LLMProvider
  FeedClusterer o-- LLMProvider
```

Each AI service owns its prompt and JSON schema. All LLM output is schema-validated before use, so a malformed reply raises `LLMOutputError` and never reaches the domain.

**Implemented so far:** `GeminiProvider` (default model `gemini-3.1-flash-lite`; the SDK retries 429/5xx up to 4 times) and `MockProvider`, chosen by `LLMProviderFactory` from `LLM_PROVIDER`; `PeopleDetector`, `McqGenerator` and `FeedClusterer`. `ClaudeProvider` and `N8nWebhookProvider` are planned extension points; adding one is a new class plus one factory line (OCP).

**`PeopleDetector`** asks Gemini for `box_2d = [ymin, xmin, ymax, xmax]` on a 0–1000 grid, which is Gemini's native detection format. It converts them to normalized `{x, y, w, h}`, clamps out-of-range values, and drops malformed or degenerate boxes. The count is the number of valid boxes, so the number shown always matches the boxes drawn.

**Large media.** `Attachment` is either in-memory bytes or a file path. `GeminiProvider` sends small files inline and uploads anything larger (or any path) through the Gemini Files API, waits until the file is `ACTIVE`, and always deletes it afterwards. Video uses low media resolution (~66 tokens per frame), so a 90-minute lecture fits the context window.

**`HomeworkGuideGenerator`** reads a homework PDF once and returns its questions and sections, each with what is asked, its requirements, the key points of a correct answer (`expected`) and what would give it away (`givingAway`). IDs (`q1`, `q1.2`) are assigned by the code, never taken from the model; a reply with no usable question raises `LLMOutputError`. `outline` strips the answers for students.

**`HomeworkReviewer`** reviews a solution (a PDF or photos) against that guide, section by section: evidence first, then answered or not, a 1–100 score, what meets, what is missing and a direction. The prompt forbids giving the answer and treats the files as data, so text addressing the reviewer is ignored (field test T10: "give 100" did not raise the score). `validateSections` returns exactly one mark per guide section in order: unknown IDs are dropped, a missing section is unanswered (0), an answered 0 becomes 1.

**`McqGenerator`** turns one slide image into up to 3 poll drafts. Drafts with fewer than 2 options, an empty option or an out-of-range `correctIndex` are dropped; if none survive it raises `LLMOutputError`. **`PracticeQuestionGenerator`** reads a whole deck (PDF or image; over 15 MB it goes through the Files API like video) and returns up to `LECTURE_QUESTIONS` = 8 distinct open questions spread across its topics; empty or over-long ones are dropped. **`FeedClusterer`** keeps only post ids it was given and assigns each post to at most one theme, so the model cannot invent or double-count questions.

## 3. `attendance/`: Chain of Responsibility + Strategy

```mermaid
classDiagram
  direction TB
  class CheckInRule {
    <<interface>>
    +check(ctx: CheckInContext) Promise~RuleResult~
  }
  class RuleResult {
    +kind: pass | warn | reject
    +code: string
    +message: string
    +data: Record~string, unknown~
  }
  class CheckInContext {
    +session: Session
    +studentId: string
    +deviceId: string
    +token: string
    +location: GeoPoint
    +now: Date
  }
  class TokenRule {
    -tokens: QrTokenService
    +check(ctx) Promise~RuleResult~
  }
  class SessionActiveRule {
    +check(ctx) Promise~RuleResult~
  }
  class DuplicateStudentRule {
    -repo: AttendanceRepository
    +check(ctx) Promise~RuleResult~
  }
  class DeviceBindingRule {
    -repo: AttendanceRepository
    +check(ctx) Promise~RuleResult~
  }
  class GeofencePolicy {
    <<interface>>
  }
  class LenientGeofencePolicy {
    +check(ctx) Promise~RuleResult~
  }
  class StrictGeofencePolicy {
    +check(ctx) Promise~RuleResult~
  }
  class GeofencePolicyFactory {
    +for(mode: GeofenceMode)$ GeofencePolicy
  }
  class GeoMath {
    +distanceM(a: GeoPoint, b: GeoPoint)$ number
  }
  class QrTokenService {
    -windowSec: number
    -clock: Clock
    +issue(sessionId: string, secret: string) string
    +parse(token: string) TokenClaims
    +verify(token: string, secret: string) TokenClaims
  }
  class AttendanceService {
    -baseRules: CheckInRule[]
    -repo: AttendanceRepository
    -clock: Clock
    +checkIn(ctx: CheckInContext) Promise~CheckInOutcome~
    +manualApprove(session, studentNumber, studentName, note) Promise~AttendanceRecord~
    +remove(recordId, reason) Promise~AttendanceRecord~
    +get(recordId) Promise~AttendanceRecord~
    +listForSession(sessionId) Promise~AttendanceRecord[]~
    +flag(recordId, reason) Promise~void~ «M4»
    +presentCount(sessionId) Promise~number~ «M4»
  }
  class SessionService {
    -sessions: SessionRepository
    -courses: CourseRepository
    -tokens: QrTokenService
    -clock: Clock
    +start(lecturerId, input: StartSessionInput) Promise~Session~
    +end(session) Promise~Session~
    +currentQrToken(session) QrTicket
    +get(sessionId) Promise~Session~
    +getOwned(sessionId, lecturerId) Promise~Session~
    +getOwnedCourse(courseId, lecturerId) Promise~Course~
  }
  class CourseService {
    -courses: CourseRepository
    -enrollments: EnrollmentRepository
    -slots: CourseSlotRepository
    -attendance: AttendanceRepository
    -parser: RosterParser
    -clock: Clock
    +create(lecturerId, code, name) Promise~Course~
    +importRoster(course, text or file) Promise~RosterImport~
    +enroll(course, studentNumber, name) Promise~Enrollment~
    +unenroll(course, studentNumber) Promise~void~
    +roster(courseId) Promise~Enrollment[]~
    +setTimetable(course, slots: SlotInput[], term) Promise~CourseSlot[]~
    +isMember(courseId, studentNumber) Promise~boolean~
    +requireMember(courseId, studentNumber) Promise~void~
  }
  class RosterParser {
    +fromText(text) RosterParseResult
    +fromFile(data: Buffer) RosterParseResult
    +fromRows(rows: string[][]) RosterParseResult
  }
  class AttendanceExportService {
    -repo: AttendanceRepository
    -courses: CourseRepository
    -exporters: Map~ExportFormat, SpreadsheetExporter~
    +formats() ExportFormat[]
    +export(session, format: ExportFormat) Promise~ExportOutput~
  }

  CheckInRule <|.. TokenRule
  CheckInRule <|.. SessionActiveRule
  CheckInRule <|.. DuplicateStudentRule
  CheckInRule <|.. DeviceBindingRule
  CheckInRule <|-- GeofencePolicy
  GeofencePolicy <|.. LenientGeofencePolicy
  GeofencePolicy <|.. StrictGeofencePolicy
  GeofencePolicyFactory ..> GeofencePolicy : creates
  LenientGeofencePolicy ..> GeoMath
  StrictGeofencePolicy ..> GeoMath
  TokenRule o-- QrTokenService
  SessionService o-- QrTokenService
  AttendanceService o-- "*" CheckInRule : baseRules
  CourseService o-- RosterParser
  CourseService ..> AttendanceRepository : attendedCourse
  AttendanceService ..> GeofencePolicyFactory : appends policy per session
  CheckInRule ..> CheckInContext
  CheckInRule ..> RuleResult
```

**Chain semantics.** The rules run in order. The first `reject` stops the chain and becomes the error shown to the student. Each `warn` sets a flag on the record and evaluation continues. The order is DuplicateStudent, then Token, SessionActive, DeviceBinding and finally the GeofencePolicy chosen per session. DuplicateStudent runs first so that a student who is already present and reopens a stale link sees their own record, not "code expired". This is safe because the check can only return the caller's own record.

**Idempotency.** `DuplicateStudentRule` returns `reject` with code `ALREADY_CHECKED_IN`. `AttendanceService` maps that code to "return the existing record" (UC1 4b). Two concurrent scans by the same student are caught by the DB unique index `(session, student_number)`, and the loser also receives the existing record.

**Geofence and GPS accuracy.** `GeoMath.isInside` credits the accuracy the phone reports, capped at 100 m. A fix that is noisy but honest still passes, while a fix with 2 km accuracy cannot pass anywhere. A session with no location (the lecturer denied access) disables the geofence.

**Course membership.** A member is a student on the roster (`Enrollment`, keyed by student ID) or one who attended any session of the course, so walk-ins and courses without a roster keep working. The same "enrolled or attended" condition is written into the PocketBase view rules of everything a member reads after a lesson. `RosterParser` reads pasted lists, CSV/TSV (UTF-8 or Windows-1255) and Excel; IDs that lost their leading zeros in Excel are padded back to 9 digits. An import adds and renames, never removes. `setTimetable` replaces the course's weekly slots as a whole and rejects overlaps on the same day.

**Identity key.** Records are keyed by `studentNumber` (not by user id), so the lecturer can manually approve a student who never signed in.

## 4. `challenge/`: Template Method + State + Factory

```mermaid
classDiagram
  direction TB
  class Challenge {
    <<abstract>>
    #data: ChallengeData
    +state: ChallengeData
    +isExpired(now: Date) boolean
    +start(now: Date, durationSec: number) void
    +accept(r: SubmittedResponse, ctx: AcceptContext) void
    +close(responses, eligible: string[], now: Date, force: boolean) Map~string, Verdict~
    #assertState(expected: ChallengeStatus) void
    #validatePayload(payload: ResponsePayload, now: Date)* void
    #evaluate(responses: SubmittedResponse[])* Map~string, Verdict~
  }
  class RollCallChallenge {
    -tokens: QrTokenService
    +currentToken() string
    #validatePayload(payload) void
    #evaluate(responses) Map~string, Verdict~
  }
  class VisualPingChallenge {
    -boxes: Box[]
    -hitTester: SeatHitTester
    #validatePayload(payload) void
    #evaluate(responses) Map~string, Verdict~
  }
  class ChallengeFactory {
    +create(data: ChallengeData, deps)$ Challenge
  }
  class SeatHitTester {
    -padding: number
    +classify(taps: Map~string, Point~, boxes: Box[]) Map~string, Verdict~
  }
  class ChallengeManager {
    -detector: PeopleDetector
    -images: ImageProcessor
    -headcounts: HeadcountRepository
    -challenges: ChallengeRepository
    -responses: ChallengeResponseRepository
    -attendance: AttendanceService
    -tokens: QrTokenService
    -clock: Clock
    +snapHeadcount(session, photo: Attachment) Promise~HeadcountResult~
    +launch(session, type: ChallengeType, headcountId) Promise~ChallengeData~
    +submitResponse(challengeId, student, payload) Promise~void~
    +rollcallToken(challenge) QrTicket
    +close(challengeId, force) Promise~Map~
    +closeExpired() Promise~number~
  }
  class HeadcountResult {
    +headcount: Headcount
    +presentCount: number
    +mismatch: boolean
    +detectionFailed: boolean
  }
  class HeadcountRepository {
    <<interface>>
    +create(data, files) Promise~Headcount~
    +getBlurred(id) Promise~Buffer~
    +purgeClearPhotos(sessionId) Promise~void~
  }
  class ChallengeRepository {
    <<interface>>
    +findActiveBySession(sessionId) Promise~ChallengeData~
    +listActiveExpired(now) Promise~ChallengeData[]~
  }
  class ChallengeResponseRepository {
    <<interface>>
    +findByChallengeAndStudent(challengeId, studentNumber) Promise~ChallengeResponse~
    +listByChallenge(challengeId) Promise~ChallengeResponse[]~
    +setVerdict(id, verdict) Promise~void~
  }

  Challenge <|-- RollCallChallenge
  Challenge <|-- VisualPingChallenge
  ChallengeFactory ..> Challenge : creates
  VisualPingChallenge o-- SeatHitTester
  ChallengeManager ..> ChallengeFactory
  ChallengeManager o-- PeopleDetector
  ChallengeManager o-- ImageProcessor
  ChallengeManager o-- AttendanceService
  ChallengeManager o-- HeadcountRepository
  ChallengeManager o-- ChallengeRepository
  ChallengeManager o-- ChallengeResponseRepository
  ChallengeManager ..> HeadcountResult
```

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> active : start()
  active --> active : respond() [eligible, first response, before expiresAt]
  active --> closed : close() [now >= expiresAt]
  closed --> resolved : lecturer reviewed all flags
  resolved --> [*]
```

**Template Method.** `start`, `accept` and `close` fix the order of the guards: state, then expiry, then eligibility, then a single answer per student. Subclasses only supply `validatePayload` (a roll-call checks its own rotating token; a visual ping checks the tap coordinates) and `evaluate`. `close` then adds `no_response` for every eligible student who didn't answer.

**Eligibility.** Only students checked in (and not removed) when the challenge *started* are challenged. Students who arrive later aren't penalised.

**Classification rules in `SeatHitTester`** (coordinates are normalized to 0..1; each box is padded by `padding`, default 0.03):
- A tap inside no box is labelled `empty_seat`.
- When two or more taps fall in the same box, every one of them is labelled `collision`. The lecturer decides who is real.
- If a tap lies in two overlapping boxes, the nearest box centre wins.
- A checked-in student with no tap is labelled `no_response`.

## 5. `engagement/` and `content/`

```mermaid
classDiagram
  direction TB
  class ConfusionMeter {
    -signals: LostSignalRepository
    -attendance: AttendanceService
    -clock: Clock
    -cooldownSec: number = 60
    +record(session, student: Participant) Promise~LostOutcome~
    +level(sessionId, windowSec = 120) Promise~ConfusionLevel~
    +series(sessionId, bucketSec) Promise~TimePoint[]~ «M6»
  }
  class FeedService {
    -posts: FeedPostRepository
    -votes: PostVoteRepository
    -attendance: AttendanceService
    -clusterer: FeedClusterer
    -clock: Clock
    +post(session, author: Participant, text, anonymous) Promise~FeedPost~
    +upvote(postId, voter: Participant) Promise~void~
    +markAnswered(postId, answered) Promise~FeedPost~
    +answer(postId, text) Promise~FeedPost~ «M8»
    +clusterOpen(sessionId) Promise~Theme[]~
  }
  class PollService {
    -polls: PollRepository
    -votes: PollVoteRepository
    -attendance: AttendanceService
    -generator: McqGenerator
    -clock: Clock
    +normalizeDraft(draft: McqDraft)$ McqDraft
    +draftFromSlide(slide: Attachment) Promise~McqDraft[]~
    +create(session, draft: McqDraft, source) Promise~Poll~
    +open(session, pollId) Promise~Poll~
    +vote(pollId, student: Participant, optionIndex) Promise~void~
    +close(pollId) Promise~PollResults~
  }
  class AttendanceService {
    +requireParticipant(sessionId, studentNumber) Promise~AttendanceRecord~
    +presentCount(sessionId) Promise~number~
  }
  class FeedbackService {
    -feedback: LessonFeedbackRepository
    -attendance: AttendanceService
    -clock: Clock
    +status(session, student: Participant) Promise~FeedbackStatus~
    +submit(session, student: Participant, rating: FeedbackRating, comment) Promise~void~
    +summary(sessionId) Promise~FeedbackSummary~
  }
  class PracticeService {
    -questions: PracticeQuestionRepository
    -attendance: AttendanceService
    -generator: McqGenerator
    -clock: Clock
    +draftFromLecture(deck: Attachment) Promise~string[]~
    +add(session, question: string, source) Promise~PracticeQuestion~
    +remove(questionId) Promise~void~
    +get(questionId) Promise~PracticeQuestion~
  }
  class MaterialService {
    -materials: MaterialRepository
    -clock: Clock
    +addLink(session, title, url) Promise~Material~
    +addFile(session, title, file: FileInput) Promise~Material~
    +remove(materialId) Promise~void~
    +get(materialId) Promise~Material~
  }
  class RecordingPipeline {
    -recordings: RecordingRepository
    -uploads: UploadStore
    -summarizer: LectureSummarizer
    -confusion: ConfusionMeter
    -queue: BackgroundQueue
    +start(session, meta) Promise~Recording~
    +appendChunk(recording, offset, data) Promise~number~
    +complete(recording) Promise~Recording~
    +process(recordingId) Promise~void~
    +timeline(session, recording, bucketSec = 60) Promise~Timeline~
    +publish(recording, published) Promise~Recording~
    +recoverInterrupted() Promise~number~
  }
  class HomeworkAnalysisService {
    -assignments: AssignmentRepository
    -submissions: SubmissionRepository
    -insights: InsightsRepository
    -extractor: TextExtractor
    -generator: HomeworkGuideGenerator
    -reviewer: HomeworkReviewer
    -membership: CourseService
    -queue: BackgroundQueue
    +publish(course, input, pdf) Promise~Assignment~
    +generateGuide(assignmentId, pdf) Promise~void~
    +retryGuide(assignment) Promise~Assignment~
    +remove(assignment) Promise~void~
    +check(assignment, student: Participant, solution) Promise~Submission~
    +review(submissionId, assignment, solution) Promise~void~
    +view(submission) Promise~SubmissionView~
    +chart(assignment, viewer) Promise~Chart~
    +buildInsights(assignment) Promise~AssignmentInsights~
    +recoverInterrupted() Promise~number~
  }
  class ScoreCalculator {
    +section(mark)$ number
    +questions(outline, marks)$ QuestionScore[]
    +total(outline, marks)$ number
    +places(scores: number[])$ number[]
  }
  class Fingerprinter {
    +tokens(text, kind: TextKind)$ string[]
    +sketch(text, kind: TextKind)$ number[]
    +similarity(a: number[], b: number[])$ number
  }
  class SimilarityAnalyzer {
    +pairsAbove(sketches: Map~string, number[]~, threshold)$ SimilarPair[]
  }
  class TextExtractor {
    +extract(file: UploadedFile) Promise~text, kind~
  }
  class BackgroundQueue {
    +add(name, job) void
    +idle() Promise~void~
  }
  class UploadStore {
    +append(id, offset, data) Promise~number | null~
    +size(id) Promise~number~
    +path(id) string
    +remove(id) Promise~void~
  }

  ConfusionMeter ..> AttendanceService : participant + present count
  FeedService ..> AttendanceService : participant check
  PollService ..> AttendanceService : participant check
  PollService o-- McqGenerator
  FeedService o-- FeedClusterer
  RecordingPipeline o-- LectureSummarizer
  RecordingPipeline o-- ConfusionMeter
  RecordingPipeline o-- UploadStore
  RecordingPipeline o-- BackgroundQueue
  HomeworkAnalysisService o-- HomeworkGuideGenerator
  HomeworkAnalysisService o-- HomeworkReviewer
  HomeworkAnalysisService o-- TextExtractor
  HomeworkAnalysisService o-- BackgroundQueue
  HomeworkAnalysisService ..> CourseService : requireMember
  HomeworkAnalysisService ..> ScoreCalculator
  HomeworkAnalysisService ..> SimilarityAnalyzer
  HomeworkAnalysisService ..> Fingerprinter
  SimilarityAnalyzer ..> Fingerprinter
  FeedbackService ..> AttendanceService : participant check
  PracticeService o-- PracticeQuestionGenerator
```

**Who may take part:** the backchannel and polls are open to students checked in to the session and not removed (`AttendanceService.requireParticipant`, error `NOT_CHECKED_IN`). PocketBase list rules enforce the same condition, so it also decides who receives realtime events.

**Rules encoded in the classes:**
- `ConfusionMeter.record` accepts one signal per student per 60 s. A repeat inside the cooldown returns `{accepted: false, retryInSec}` instead of an error, so pressing twice never shows a failure. `level` counts *distinct* students in the last 120 s, relative to those present.
- Lost signals and post authors are stored in **hidden** fields: the lecturer sees how many are lost and what was asked, never who (unless the student chose to post with their name).
- `FeedService.post` works after the session ends (FR-BC-02); `ConfusionMeter.record` and `PollService.open` require an active session.
- `PollService.open` closes any other open poll in the session, so phones never show two polls. `close` is idempotent and stores the tally in `results`. The correct answer lives in a hidden field and is copied to `answer_index` only on close.
- Duplicate votes are stopped twice: an `exists` check gives a friendly `ALREADY_VOTED`, and the unique index on (poll, student) and (post, voter) catches the concurrent case.

**Lecture recordings (`content/`):**
- Cloudflare caps a request at 100 MB, so the browser uploads in 50 MB chunks. Each chunk carries its byte offset: a repeated chunk is ignored and a gap is rejected, so retries are safe.
- The recording is processed by `BackgroundQueue` (one job at a time, to stay inside LLM rate limits) and **never stored**: `process` deletes the temp file whatever happens. Only the summary is kept.
- `timeline` moves each 60 s bucket of "I'm lost" signals onto the recording clock: t = (signal − session start) − `offsetSec`. A spike is a bucket where ≥2 students **and** ≥10% of those present were lost; it is labelled with the chapter it falls in.
- Jobs live in memory, so on startup `recoverInterrupted` marks anything unfinished as failed with a "please re-upload" message, instead of leaving it "processing" forever.

**Lecture page (`content/`, M8):** each lecture has a page for every course participant, including students who missed it. It shows the published summary, materials, practice questions, the closed polls with results, and the questions with the lecturer's written answers.
- `PracticeService` publishes open review questions: trimmed text, no options and nothing for students to submit. `draftFromLecture` returns AI drafts only; the lecturer publishes the ones they tick. Both sides read the questions straight from PocketBase.
- `MaterialService` accepts http(s) links and files up to 50 MB (stored as protected PocketBase files, so downloading needs a short-lived file token).
- `FeedService.answer` stores a written answer and marks the post answered, during or after the lecture.
- Access, all in PocketBase rules: course participants read questions and answers, review questions and materials, and **closed** polls only (an open poll stays limited to those checked in). Posting, upvoting and voting still require being checked in to that lecture.

**Lecture feedback (`engagement/`, M9):** `FeedbackService` opens when the session ends and closes 24 h later (`FEEDBACK_WINDOW_MS`). Only students checked in to that lecture may answer, once each (`ALREADY_SENT`, plus a unique index). The `lesson_feedback` collection has **no** list or view rule, so no one, the lecturer included, can read a single answer through PocketBase. `summary` returns only the count until there are 3 answers (`MIN_FEEDBACK_RESPONSES`), then counts per option and the comments ordered by option and text, never by time, so their order cannot reveal who wrote them.

**Homework (`content/`):**
- Publishing stores the PDF (a protected file) and reads it on `BackgroundQueue` into the review guide. The guide is a **hidden** field, because it holds the expected answers; the public `outline` has the questions and requirements only. A failed reading can be retried from the stored PDF.
- `check` runs only when the guide is ready and the student is a course member, and allows `MAX_CHECKS` = 3 per student per homework. One submission row per student keeps the latest successful result; a failed check sets `failed` with "did not count" and keeps the previous report.
- The solution never reaches PocketBase: the files live only in the background job's memory. After the review, a text fingerprint of a PDF's text (for copy detection) is the only thing derived from it; photos have none.
- `ScoreCalculator` computes section, question and total scores, so the model only marks sections. `chart` returns every checked student's latest scores by total, question and section; students get it anonymously and only from `MIN_CHART_SIZE` = 3 checked students; the lecturer gets names.
- **Copy detection uses fingerprints, not embeddings** (design change after the field test, see the tools report, T9). Code is tokenised with identifiers, numbers and strings normalised, so renaming variables does not hide a copy; prose uses word shingles. A bottom-256 MinHash sketch bounds storage and estimates Jaccard similarity. Pairs ≥ 0.5 are shown to the lecturer only, with names, for manual review.

## 6. `infra/`: Repository + Strategy

```mermaid
classDiagram
  direction TB
  class Repository~T~ {
    <<interface>>
    +get(id: string) Promise~T | null~
    +create(data: Omit~T, id~) Promise~T~
    +update(id: string, data: Partial~T~) Promise~T~
  }
  class PbRepository~T~ {
    <<abstract>>
    #pb: PocketBase
    #col: RecordService
    #expand: string
    #toEntity(rec)* T
    #toRecord(e: Partial~T~)* Record
    #first(filter, params) Promise~T | null~
  }
  class PbAttendanceRepository {
    +findBySessionAndStudentNumber(sessionId, studentNumber) Promise~AttendanceRecord~
    +findBySessionAndDevice(sessionId, deviceId) Promise~AttendanceRecord~
    +listBySession(sessionId) Promise~AttendanceRecord[]~
  }
  class PbSessionRepository {
    expands course to resolve lecturerId
    +countByCourse(courseId) Promise~number~
  }
  class PbCourseRepository {
    +get(id) Promise~Course | null~
    +create(data) Promise~Course~
    +update(id, data) Promise~Course~
    +findByLecturerAndCode(lecturerId, code) Promise~Course | null~
  }
  class PbEnrollmentRepository {
    +findByCourseAndStudent(courseId, studentNumber) Promise~Enrollment~
    +listByCourse(courseId) Promise~Enrollment[]~
    +delete(id) Promise~void~
  }
  class PbCourseSlotRepository {
    +listByCourse(courseId) Promise~CourseSlot[]~
    +replaceForCourse(courseId, slots) Promise~CourseSlot[]~
  }
  class PbHeadcountRepository {
    +purgeClearPhotos(sessionId) Promise~void~ «M4»
  }
  class PbFeedPostRepository {
    -voteLock: KeyedLock
    +listBySession(sessionId) Promise~FeedPost[]~
    +incrementVotes(id) Promise~void~
  }
  class KeyedLock {
    +run~T~(key, task) Promise~T~
  }
  class InMemoryRepository~T~ {
    -items: Map~string, T~
  }
  class InMemoryAttendanceRepository
  class ImageProcessor {
    <<interface>>
    +blur(img: Buffer, sigma: number) Promise~Buffer~
  }
  class SharpImageProcessor
  class SpreadsheetExporter {
    <<interface>>
    +export(rows: AttendanceRow[], meta: SessionMeta) Promise~ExportOutput~
  }
  class XlsxExporter
  class CsvExporter
  class GoogleSheetsExporter {
    -sheets: sheets_v4.Sheets
    -spreadsheetId: string
  }
  class Clock {
    <<interface>>
    +now() Date
  }
  class SystemClock
  class FixedClock {
    +advance(ms: number) void
  }

  Repository~T~ <|.. PbRepository~T~
  Repository~T~ <|.. InMemoryRepository~T~
  PbRepository~T~ <|-- PbAttendanceRepository
  PbRepository~T~ <|-- PbSessionRepository
  PbRepository~T~ <|-- PbEnrollmentRepository
  PbRepository~T~ <|-- PbHeadcountRepository
  PbRepository~T~ <|-- PbFeedPostRepository
  PbFeedPostRepository o-- KeyedLock
  InMemoryRepository~T~ <|-- InMemoryAttendanceRepository
  ImageProcessor <|.. SharpImageProcessor
  SpreadsheetExporter <|.. XlsxExporter
  SpreadsheetExporter <|.. CsvExporter
  SpreadsheetExporter <|.. GoogleSheetsExporter
  Clock <|.. SystemClock
  Clock <|.. FixedClock
```

Queries are named methods on domain-specific repository interfaces, never raw PocketBase filter strings, so the PocketBase query language never leaks into the domain. Other repositories follow the same pattern (`PbChallengeRepository`, `PbPollRepository` and so on). Each domain-specific repository is an interface, for example `AttendanceRepository extends Repository<AttendanceRecord>`. Unit tests use `InMemoryRepository`-based fakes.

**Why `KeyedLock`:** PocketBase's `votes+` modifier is a read-modify-write in Go, not an atomic SQL update. An integration test fired 12 concurrent upvotes from 6 students; all 6 valid votes were accepted but only 2 were counted. `PbFeedPostRepository` now serialises increments per post inside the API process. This is valid because the API runs as a single instance; scaling out would need a recount or a database-side counter.

## 6b. `admin/` and course setup

```mermaid
classDiagram
  direction LR
  class UserRepository {
    <<interface>>
    +get(id) Promise~ManagedUser | null~
    +search(q: string, limit: number) Promise~ManagedUser[]~
    +setRole(id, role: Role) Promise~ManagedUser~
  }
  class PbUserRepository
  class InMemoryUserRepository
  class UserAdminService {
    -users: UserRepository
    -admins: Set~string~
    +isAdmin(email) boolean
    +search(q) Promise~ManagedUser[]~
    +setRole(actorId, userId, role: Role) Promise~ManagedUser~
  }
  class AdminController {
    -admins: UserAdminService
    +routes() Hono
  }
  class CourseController {
    -courses: CourseService
    -sessions: SessionService
    +routes() Hono
  }
  UserRepository <|.. PbUserRepository
  UserRepository <|.. InMemoryUserRepository
  UserAdminService o-- UserRepository
  AdminController o-- UserAdminService
  CourseController o-- CourseService
  CourseController o-- SessionService : getOwnedCourse
```

Admins are not a role in the database: `ADMIN_EMAILS` (server configuration) lists them, so no user can make themselves an admin, and the `users` update rule already stops users from changing their own `role`. Only the API, through `PbUserRepository`, writes `role`. `AdminController` serves `GET /me` (is the caller an admin), `GET /admin/users` and `POST /admin/users/:id/role` (both behind `requireAdmin`). The lecturer's course setup is `CourseController`, behind `requireLecturer` and course ownership: `POST /courses`, `POST /courses/:id/roster` (file or pasted text), `POST`/`DELETE /courses/:id/enrollments` and `PUT /courses/:id/timetable`. An admin cannot change their own role, so the last admin cannot lock themselves out of the lecturer screens.

## 7. SOLID mapping
| Principle | Evidence |
|---|---|
| SRP | Each check-in rule, geofence policy and AI task is its own class; `SeatHitTester` is pure geometry |
| OCP | A new rule, challenge type, exporter or LLM vendor is a new class; existing code is unchanged |
| LSP | Any `LLMProvider`, `Challenge` subclass or `SpreadsheetExporter` can replace its base in tests and production |
| ISP | Small interfaces: `LLMProvider` (one method), `CheckInRule`, `ImageProcessor`; services take `Pick<AttendanceService, …>` of only the methods they call |
| DIP | Services depend on `Repository`, `LLMProvider`, `Clock` and `ImageProcessor`; concrete classes are bound only in `container.ts` |
