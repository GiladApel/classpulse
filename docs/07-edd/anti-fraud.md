# EDD-AntiFraud

> Package `apps/api/src/challenge`. SDD §2.5. Covers FR-AF-01 … FR-AF-09.
> The spot check: "everyone who is here, point at your seat on this photo".

## 1. Classes: Template Method + State + Factory

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
    +launch(session, type: ChallengeType, headcountId, opts: afterClass) Promise~ChallengeData~
    +submitResponse(challengeId, student, payload) Promise~void~
    +rollcallToken(challenge) token, refreshInMs
    +get(challengeId) Promise~ChallengeData~
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

The challenge's life (pending → active → closed) is the [Challenge state machine](README.md#challenge).

## 2. Algorithms and rules

- **Headcount.** `PeopleDetector` returns person boxes; the count is the number of valid boxes, so the number shown always matches the boxes drawn ([EDD-AI](ai.md)). The server blurs a copy (`ImageProcessor.blur`: downscale, blur, upscale, so faces cannot be recovered) and stores both; `mismatch` is true when present check-ins exceed the count by more than the tolerance (10 %).
- **Template Method.** `start`, `accept` and `close` fix the order of the guards: state, then expiry, then eligibility, then one answer per student. Subclasses supply only `validatePayload` (a Roll-call checks its own rotating token; a Visual Ping checks the tap is inside the photo) and `evaluate`. `close` adds `no_response` for every eligible student who did not answer, and flags every record whose label is not `ok`.
- **Eligibility.** Only students checked in (and not removed) when the challenge *started* are challenged; students who arrive later are not penalised.
- **`SeatHitTester`** (coordinates normalised to 0..1, each box padded by 0.03):
  - a tap inside no box → `empty_seat`;
  - two or more taps in the same box → `collision` for each (the lecturer decides who is real);
  - a tap inside two overlapping boxes → the nearest box centre wins;
  - no tap → `no_response`.
- **After class.** `launch(…, {afterClass: true})` is allowed only for a Visual Ping with a headcount, also on an ended lesson, and runs for 24 hours; it is answered from a card on the lesson page. The same `closeExpired` timer closes it.
- **One at a time.** A lesson has at most one active challenge.

## 3. Data

| Collection | Key fields | Rules |
|------------|-----------|-------|
| headcounts | session, photo (clear, lecturer only, deleted at lesson end), blurred_photo, people_count, confidence, boxes, checkins_at_snap | The lecturer reads all; the clear photo is a protected file |
| challenges | session, headcount, type, status, started_at, expires_at, **secret**, image (blurred) | Checked-in students read the active challenge of their lesson (and so receive its realtime event) |
| challenge_responses | challenge, student, student_number, x, y, responded_at, verdict | Unique (challenge, student_number); a student reads only their own |

## 4. Sequences

### SD2: Headcount and Visual Ping (UC-13, UC-02)
```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer attendance tab
  participant API as ChallengeController
  participant CM as ChallengeManager
  participant PD as PeopleDetector
  participant LLM as LLMProvider
  participant IMG as ImageProcessor
  participant AS as AttendanceService
  participant PB as PocketBase
  actor S as Checked-in students

  L->>API: POST /sessions/:id/headcounts (photo)
  API->>CM: snapHeadcount(session, photo)
  CM->>PD: detect(photo)
  PD->>LLM: generateStructured(task=detect_people, schema, photo)
  LLM-->>PD: boxes
  PD-->>CM: Detection (validated, count = number of boxes)
  CM->>IMG: blur(photo, 30)
  IMG-->>CM: blurred
  CM->>AS: presentCount(sessionId)
  AS-->>CM: 33
  CM->>PB: create headcounts {photo, blurred_photo, count, boxes, checkins_at_snap}
  CM-->>API: HeadcountResult {count 28, present 33, mismatch true}
  API-->>L: "33 checked in vs ~28 people"

  L->>API: POST /sessions/:id/challenges {type: visual_ping, headcountId}
  API->>CM: launch(session, visual_ping, headcountId)
  CM->>CM: ChallengeFactory.create(), then start(now, 45) [pending to active]
  CM->>PB: create challenges {active, blurred image, expires_at = now + 45 s}
  PB--)S: realtime "create" (list rule: checked-in students only)
  PB--)L: realtime "create", clear photo with a heatmap layer

  loop each student until expires_at
    S->>S: blurred photo and countdown, the student taps their seat
    S->>API: POST /challenges/:id/responses {x, y}
    API->>CM: submitResponse(challengeId, student, tap)
    CM->>CM: challenge.accept(r, {eligible, alreadyAnswered, now})
    alt not active, not eligible or already answered
      CM-->>API: DomainError
      API-->>S: 409
    else ok
      CM->>PB: create challenge_responses {x, y}
      PB--)L: realtime, a heatmap dot
      API-->>S: 200 "received"
    end
  end

  CM->>CM: closeExpired(), challenge.close(responses, eligible)
  CM->>CM: SeatHitTester.classify(taps, boxes)
  CM->>PB: update responses.verdict
  CM->>AS: flag(recordId, verdict) for each label not ok
  PB--)L: realtime, flagged rows
  L->>API: DELETE /attendance/:recordId or POST /attendance/:recordId/confirm
```

### SD3: Roll-call (UC-13 alternative)
```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer
  participant API as ChallengeController
  participant CM as ChallengeManager
  participant P as Projector view
  participant PB as PocketBase
  actor S as Students in the room

  L->>API: POST /sessions/:id/challenges {type: rollcall}
  API->>CM: launch(session, rollcall)
  CM->>CM: RollCallChallenge.start() [fresh secret, expires_at = now + 30 s]
  CM->>PB: create challenges {rollcall, active}
  PB--)P: realtime, the projector switches to the roll-call QR
  P->>API: GET /challenges/:id/qr (rotating)
  S->>API: POST /challenges/:id/responses {token}
  API->>CM: submitResponse(...)
  CM->>CM: RollCallChallenge.validatePayload, token valid for this challenge?
  CM->>PB: create challenge_responses
  CM->>CM: closeExpired(), evaluate(), missing students get no_response
  CM->>PB: flag the missing students
  PB--)L: realtime, flagged list
```

## 5. Errors and edge cases

| Code | HTTP | When |
|------|------|------|
| `CHALLENGE_ACTIVE` | 409 | Launching while another challenge of the lesson is active |
| `PHOTO_REQUIRED` | 409 | An after-class check that is not a Visual Ping on a class photo |
| `NOT_FOUND` | 404 | A headcount that does not exist or belongs to another lesson |
| `SESSION_ENDED` | 409 | A live challenge on an ended lesson (only the after-class check is allowed) |
| `NOT_CHECKED_IN` | 409 | A response from a student who was not checked in when it started |
| Challenge state errors | 409 | Answering a closed challenge, or answering twice |

Edge cases: an LLM failure leaves the headcount with `detectionFailed` ("count unavailable"), and Roll-call still works; a student removed during the challenge is not labelled.

## 6. Configuration and performance

| Setting | Default |
|---------|---------|
| Roll-call / Visual Ping / after-class duration | 30 s / 45 s / 24 h |
| Mismatch tolerance | 10 % |
| Blur strength | σ = 30 (field test T6 checks the lowest σ where faces are unidentifiable) |
| Box padding | 0.03 |
| Class photo | ≤ 15 MB |
| Expiry timer | every 2 s (`index.ts`, shared with polls) |

## 7. Alternatives considered

| Alternative | Why not |
|-------------|---------|
| Face recognition per student | Privacy (NFR-04), consent, and accuracy in a lecture hall |
| Show students the clear photo | They would see each other's faces |
| Automatic removal of flagged records | The lecturer keeps the decision (FR-AF-07); `collision` is ambiguous by nature |
| Only Roll-call | A friend at the door can rescan for others; a seat tap is harder to fake from outside |

## 8. Testing

- **Unit:** `Challenge.test.ts` (template order, state, expiry, eligibility), `SeatHitTester.test.ts` (empty seat, collision, overlap, padding), `ChallengeManager.test.ts` (headcount mismatch, launch rules, after-class, close and flags), `PeopleDetector.test.ts`.
- **HTTP:** `app.challenge.test.ts` (roles, responses, roll-call token).
- **Integration:** `challenges.int.test.ts` (only checked-in students see the challenge, the secret and the clear photo are hidden).
- **E2E:** `challenge.spec.ts` (Visual Ping labels, after-class check from home).
