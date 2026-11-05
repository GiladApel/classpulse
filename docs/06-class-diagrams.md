# Class Diagrams: ClassPulse API

Class and method names here are the contract for `apps/api/src`. One folder per package, one file per class.

**Design patterns used:**

| Pattern | Where |
|---|---|
| Strategy | `LLMProvider`, `GeofencePolicy`, `SpreadsheetExporter`, `ImageProcessor` |
| Factory | `LLMProviderFactory`, `GeofencePolicyFactory`, `ChallengeFactory`, `PollTemplateFactory` |
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
  class FeedPost {
    +id: string
    +text: string
    +anonymous: boolean
    +votes: number
    +answered: boolean
  }
  class Poll {
    +id: string
    +question: string
    +options: string[]
    +correctIndex: number
    +status: PollStatus
    +source: PollSource
  }
  class Recording {
    +id: string
    +offsetSec: number
    +status: JobStatus
    +summary: LectureSummary
  }
  class Assignment {
    +id: string
    +title: string
    +rubric: RubricCriterion[]
  }
  class Submission {
    +id: string
    +review: Review
    +total: number
    +percentiles: Map~string, number~
  }

  User "1" --> "*" Course : teaches
  Course "1" *-- "*" Session
  Session "1" *-- "*" AttendanceRecord
  User "1" --> "*" AttendanceRecord : attends
  Session "1" *-- "*" Headcount
  Headcount "1" --> "*" ChallengeData : triggers
  ChallengeData "1" *-- "*" ChallengeResponse
  Session "1" *-- "*" FeedPost
  Session "1" *-- "*" Poll
  Session "1" *-- "0..1" Recording
  Course "1" *-- "*" Assignment
  Assignment "1" *-- "*" Submission
  User "1" --> "*" Submission : submits
```

## 2. `ai/`: Strategy + Adapter + Factory

```mermaid
classDiagram
  direction TB
  class LLMProvider {
    <<interface>>
    +generateStructured~T~(req: StructuredRequest) Promise~T~
  }
  class EmbeddingProvider {
    <<interface>>
    +embed(texts: string[]) Promise~number[][]~
  }
  class GeminiProvider {
    -client: GoogleGenAI
    -model: string
    +generateStructured~T~(req) Promise~T~
    +embed(texts) Promise~number[][]~
  }
  class ClaudeProvider {
    -client: Anthropic
    -model: string
    +generateStructured~T~(req) Promise~T~
  }
  class N8nWebhookProvider {
    -webhookUrl: string
    +generateStructured~T~(req) Promise~T~
  }
  class MockProvider {
    -fixtures: Map~string, unknown~
    +generateStructured~T~(req) Promise~T~
    +embed(texts) Promise~number[][]~
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
    +generate(slide: Attachment) Promise~McqDraft[]~
  }
  class LectureSummarizer {
    -llm: LLMProvider
    +summarize(media: Attachment) Promise~LectureSummary~
  }
  class HomeworkReviewer {
    -llm: LLMProvider
    +review(text: string, rubric: RubricCriterion[]) Promise~Review~
  }
  class FeedClusterer {
    -llm: LLMProvider
    +cluster(posts: FeedPost[]) Promise~Theme[]~
  }

  LLMProvider <|.. GeminiProvider
  LLMProvider <|.. ClaudeProvider
  LLMProvider <|.. N8nWebhookProvider
  LLMProvider <|.. MockProvider
  EmbeddingProvider <|.. GeminiProvider
  EmbeddingProvider <|.. MockProvider
  LLMProviderFactory ..> LLMProvider : creates
  LLMProvider ..> StructuredRequest
  PeopleDetector o-- LLMProvider
  McqGenerator o-- LLMProvider
  LectureSummarizer o-- LLMProvider
  HomeworkReviewer o-- LLMProvider
  FeedClusterer o-- LLMProvider
```

Each AI service owns its prompt and JSON schema. All LLM output is schema-validated before use, so a malformed reply raises `LLMOutputError` and never reaches the domain.

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
    +checkIn(ctx: CheckInContext) Promise~AttendanceRecord~
    +manualApprove(sessionId, studentId, note) Promise~AttendanceRecord~
    +flag(recordId, reason) Promise~void~
    +remove(recordId, reason) Promise~void~
    +presentCount(sessionId) Promise~number~
    +listForSession(sessionId) Promise~AttendanceRecord[]~
  }
  class SessionService {
    -sessions: SessionRepository
    -headcounts: HeadcountRepository
    -clock: Clock
    +start(courseId, title, location, mode, radiusM) Promise~Session~
    +end(sessionId) Promise~void~
    +currentQrToken(sessionId) Promise~string~
  }
  class AttendanceExportService {
    -repo: AttendanceRepository
    -exporters: Map~ExportFormat, SpreadsheetExporter~
    +export(sessionId, format: ExportFormat) Promise~ExportOutput~
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
  AttendanceService ..> GeofencePolicyFactory : appends policy per session
  CheckInRule ..> CheckInContext
  CheckInRule ..> RuleResult
```

**Chain semantics.** The rules run in order. The first `reject` stops the chain and becomes the error shown to the student. Each `warn` sets a flag on the record and evaluation continues. The order is Token, then SessionActive, DuplicateStudent, DeviceBinding and finally the GeofencePolicy chosen per session.

**Idempotency.** `DuplicateStudentRule` returns `reject` with code `ALREADY_CHECKED_IN`. `AttendanceService` maps that code to "return the existing record" (UC1 4b).

## 4. `challenge/`: Template Method + State + Factory

```mermaid
classDiagram
  direction TB
  class Challenge {
    <<abstract>>
    #data: ChallengeData
    +start(now: Date) void
    +respond(r: ChallengeResponse, eligible: Set~string~, now: Date) void
    +close(responses: ChallengeResponse[], checkedIn: string[]) Verdict[]
    #assertState(expected: ChallengeStatus) void
    #onStart()* void
    #validateResponse(r: ChallengeResponse)* void
    #evaluate(responses, checkedIn)* Verdict[]
  }
  class RollCallChallenge {
    -tokens: QrTokenService
    #onStart() void
    #validateResponse(r) void
    #evaluate(responses, checkedIn) Verdict[]
  }
  class VisualPingChallenge {
    -boxes: Box[]
    -hitTester: SeatHitTester
    #onStart() void
    #validateResponse(r) void
    #evaluate(responses, checkedIn) Verdict[]
  }
  class ChallengeFactory {
    +create(data: ChallengeData, headcount: Headcount)$ Challenge
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
    -clock: Clock
    +snapHeadcount(sessionId, photo: Attachment) Promise~HeadcountResult~
    +launch(sessionId, type: ChallengeType, headcountId) Promise~ChallengeData~
    +submitResponse(challengeId, studentId, payload) Promise~void~
    +closeExpired() Promise~number~
  }
  class HeadcountResult {
    +headcount: Headcount
    +presentCount: number
    +mismatch: boolean
  }

  Challenge <|-- RollCallChallenge
  Challenge <|-- VisualPingChallenge
  ChallengeFactory ..> Challenge : creates
  VisualPingChallenge o-- SeatHitTester
  ChallengeManager ..> ChallengeFactory
  ChallengeManager o-- PeopleDetector
  ChallengeManager o-- ImageProcessor
  ChallengeManager o-- AttendanceService
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

**Classification rules in `SeatHitTester`** (coordinates are normalized to 0..1; each box is padded by `padding`, default 0.02):
- A tap inside no box is labelled `empty_seat`.
- When two or more taps fall in the same box, every one of them is labelled `collision`. The lecturer decides who is real.
- If a tap lies in two overlapping boxes, the nearest box centre wins.
- A checked-in student with no tap is labelled `no_response`.

## 5. `engagement/` and `content/`

```mermaid
classDiagram
  direction TB
  class FeedService {
    -posts: FeedPostRepository
    -votes: PostVoteRepository
    -clusterer: FeedClusterer
    +post(sessionId, authorId, text, anonymous) Promise~FeedPost~
    +upvote(postId, userId) Promise~void~
    +markAnswered(postId) Promise~void~
    +clusterOpen(sessionId) Promise~Theme[]~
  }
  class ConfusionMeter {
    -signals: LostSignalRepository
    -clock: Clock
    -cooldownSec: number
    +record(sessionId, studentId) Promise~boolean~
    +level(sessionId, windowSec) Promise~number~
    +series(sessionId, bucketSec) Promise~TimePoint[]~
  }
  class PollService {
    -polls: PollRepository
    -votes: PollVoteRepository
    -generator: McqGenerator
    +createFromTemplate(sessionId, kind: TemplateKind, question) Promise~Poll~
    +draftFromSlide(slide: Attachment) Promise~McqDraft[]~
    +create(sessionId, draft: McqDraft) Promise~Poll~
    +open(pollId) Promise~void~
    +vote(pollId, studentId, optionIndex) Promise~void~
    +close(pollId) Promise~PollResults~
  }
  class PollTemplateFactory {
    +options(kind: TemplateKind)$ string[]
  }
  class RecordingPipeline {
    -recordings: RecordingRepository
    -summarizer: LectureSummarizer
    -timeline: ConfusionMeter
    +enqueue(sessionId, file, offsetSec) Promise~Recording~
    +process(recordingId) Promise~void~
    +timelineSpikes(recordingId) Promise~Spike[]~
  }
  class HomeworkAnalysisService {
    -submissions: SubmissionRepository
    -reviewer: HomeworkReviewer
    -embeddings: EmbeddingProvider
    -extractor: TextExtractor
    +submit(assignmentId, studentId, file) Promise~Submission~
    +buildInsights(assignmentId) Promise~AssignmentInsights~
  }
  class PercentileCalculator {
    +percentile(value, population: number[])$ number
  }
  class SimilarityAnalyzer {
    +pairsAbove(vectors: Map~string, number[]~, threshold) SimilarPair[]
    +cosine(a: number[], b: number[])$ number
  }
  class TextExtractor {
    +extract(file: Attachment) Promise~string~
  }

  PollService ..> PollTemplateFactory
  PollService o-- McqGenerator
  FeedService o-- FeedClusterer
  RecordingPipeline o-- LectureSummarizer
  RecordingPipeline o-- ConfusionMeter
  HomeworkAnalysisService o-- HomeworkReviewer
  HomeworkAnalysisService o-- EmbeddingProvider
  HomeworkAnalysisService o-- TextExtractor
  HomeworkAnalysisService ..> PercentileCalculator
  HomeworkAnalysisService ..> SimilarityAnalyzer
```

## 6. `infra/`: Repository + Strategy

```mermaid
classDiagram
  direction TB
  class Repository~T~ {
    <<interface>>
    +get(id: string) Promise~T~
    +find(filter: string) Promise~T[]~
    +create(data: Partial~T~) Promise~T~
    +update(id: string, data: Partial~T~) Promise~T~
  }
  class PbRepository~T~ {
    <<abstract>>
    #pb: PocketBase
    #collection: string
    #toEntity(rec)* T
    #toRecord(e: Partial~T~)* Record
  }
  class PbAttendanceRepository {
    +findBySessionAndStudent(sessionId, studentId) Promise~AttendanceRecord~
    +findBySessionAndDevice(sessionId, deviceId) Promise~AttendanceRecord~
    +countPresent(sessionId) Promise~number~
  }
  class PbSessionRepository {
    +getSecret(sessionId) Promise~string~
  }
  class PbHeadcountRepository {
    +purgeClearPhotos(sessionId) Promise~void~
  }
  class InMemoryRepository~T~ {
    -items: Map~string, T~
  }
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
  PbRepository~T~ <|-- PbHeadcountRepository
  ImageProcessor <|.. SharpImageProcessor
  SpreadsheetExporter <|.. XlsxExporter
  SpreadsheetExporter <|.. CsvExporter
  SpreadsheetExporter <|.. GoogleSheetsExporter
  Clock <|.. SystemClock
  Clock <|.. FixedClock
```

Other repositories follow the same pattern (`PbChallengeRepository`, `PbPollRepository` and so on). Each domain-specific repository is an interface, for example `AttendanceRepository extends Repository<AttendanceRecord>`. Unit tests use `InMemoryRepository`-based fakes.

## 7. SOLID mapping
| Principle | Evidence |
|---|---|
| SRP | Each check-in rule, geofence policy and AI task is its own class; `SeatHitTester` is pure geometry |
| OCP | A new rule, challenge type, exporter or LLM vendor is a new class; existing code is unchanged |
| LSP | Any `LLMProvider`, `Challenge` subclass or `SpreadsheetExporter` can replace its base in tests and production |
| ISP | `LLMProvider` and `EmbeddingProvider` are separate, because Claude and n8n need not support embeddings |
| DIP | Services depend on `Repository`, `LLMProvider`, `Clock` and `ImageProcessor`; concrete classes are bound only in `container.ts` |
