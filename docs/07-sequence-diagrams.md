# Sequence Diagrams: ClassPulse

The participants are the classes from [06-class-diagrams.md](06-class-diagrams.md). `PB` stands for PocketBase, which the API reaches through the `Pb*Repository` classes.

## SD1: Student check-in (UC1)

```mermaid
sequenceDiagram
  autonumber
  actor S as Student phone
  participant P as Projector view
  participant API as AttendanceController
  participant SS as SessionService
  participant AS as AttendanceService
  participant R as CheckInRule chain
  participant GF as GeofencePolicyFactory
  participant REPO as PbAttendanceRepository
  participant PB as PocketBase
  actor L as Lecturer dashboard

  loop every 10 s
    P->>API: GET /sessions/:id/qr
    API->>SS: currentQrToken(sessionId)
    SS-->>API: token (HMAC, window w)
    API-->>P: token
    P->>P: render QR(url + token)
  end

  S->>S: camera scans QR, opens /c/:token
  S->>S: PB auth present? (else Google OAuth + student ID)
  S->>S: navigator.geolocation (optional)
  S->>API: POST /checkins {token, deviceId, location}
  API->>AS: checkIn(ctx)
  AS->>GF: for(session.geofenceMode)
  GF-->>AS: Lenient or Strict policy
  loop rules in order: Token, SessionActive, DuplicateStudent, DeviceBinding, Geofence
    AS->>R: check(ctx)
    R-->>AS: pass / warn / reject
  end
  alt any reject
    AS-->>API: CheckInRejected(code)
    API-->>S: 4xx + Hebrew message (expired / other device / too far)
  else all pass or warn
    AS->>REPO: create(record {method: qr, geoFlag, distanceM})
    REPO->>PB: insert attendance_records
    PB--)L: realtime "create" -> row appears
    AS-->>API: AttendanceRecord
    API-->>S: 200 "Checked in 10:02"
  end
```

## SD2: Headcount + Blurred Photo Heatmap Challenge (UC4, UC5)

```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer dashboard
  participant API as ChallengeController
  participant CM as ChallengeManager
  participant PD as PeopleDetector
  participant LLM as LLMProvider
  participant IMG as ImageProcessor
  participant AS as AttendanceService
  participant PB as PocketBase
  actor S as Checked-in students

  L->>API: POST /sessions/:id/headcounts (photo)
  API->>CM: snapHeadcount(sessionId, photo)
  CM->>PD: detect(photo)
  PD->>LLM: generateStructured(task=detect_people, schema, photo)
  LLM-->>PD: {count, confidence, boxes[]}
  PD-->>CM: Detection (schema-validated)
  CM->>IMG: blur(photo, sigma)
  IMG-->>CM: blurred
  CM->>AS: presentCount(sessionId)
  AS-->>CM: 33
  CM->>PB: create headcounts {photo, blurred_photo, count, boxes, checkins_at_snap}
  CM-->>API: HeadcountResult {count 28, present 33, mismatch true}
  API-->>L: "33 check-ins vs ~28 people"

  L->>API: POST /challenges {type: visual_ping, headcountId}
  API->>CM: launch(sessionId, visual_ping, headcountId)
  CM->>CM: ChallengeFactory.create() -> VisualPingChallenge
  CM->>CM: challenge.start(now)  [pending -> active]
  CM->>PB: create challenges {active, blurred_image, expires_at = now + 45 s}
  PB--)S: realtime "create" (listRule: checked-in students only)
  PB--)L: realtime "create" -> clear photo + heatmap layer

  loop each student until expires_at
    S->>S: show blurred photo + countdown, student taps seat
    S->>API: POST /challenges/:id/responses {x, y}
    API->>CM: submitResponse(challengeId, studentId, tap)
    CM->>CM: challenge.respond(r, eligible, now)
    alt not active / not checked in / already answered
      CM-->>API: ChallengeError
      API-->>S: 409
    else ok
      CM->>PB: create challenge_responses {x, y}
      PB--)L: realtime -> heatmap dot
      API-->>S: 200 "Received"
    end
  end

  CM->>CM: closeExpired() -> challenge.close(responses, checkedIn)
  CM->>CM: SeatHitTester.classify(taps, boxes)
  CM->>PB: update responses.verdict
  CM->>AS: flag(recordId, verdict) for each non-ok verdict
  PB--)L: realtime -> flagged list on heatmap
  L->>API: DELETE /attendance/:recordId
  API->>AS: remove(recordId, "visual_ping")
  AS->>PB: update status = removed
```

## SD3: Roll-call challenge (UC4 alternative)

```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer
  participant API as ChallengeController
  participant CM as ChallengeManager
  participant P as Projector view
  participant PB as PocketBase
  actor S as Students in the room

  L->>API: POST /challenges {type: rollcall}
  API->>CM: launch(sessionId, rollcall)
  CM->>CM: RollCallChallenge.start() [fresh secret, expires_at = now + 30 s]
  CM->>PB: create challenges {rollcall, active}
  PB--)P: realtime -> projector switches to roll-call QR
  S->>API: POST /challenges/:id/responses {token}
  API->>CM: submitResponse(...)
  CM->>CM: validateResponse: token valid for this challenge?
  CM->>PB: create challenge_responses {rollcall_token_ok: true}
  CM->>CM: closeExpired(): evaluate() -> missing = no_response
  CM->>PB: flag missing students
  PB--)L: realtime -> flagged list
```

## SD4: AI poll from slide (UC8, UC7)

```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer
  participant API as PollController
  participant PS as PollService
  participant MG as McqGenerator
  participant LLM as LLMProvider
  participant PB as PocketBase
  actor S as Students
  participant P as Projector view

  L->>API: POST /polls/drafts (slide image)
  API->>PS: draftFromSlide(slide)
  PS->>MG: generate(slide)
  MG->>LLM: generateStructured(task=mcq, schema, slide)
  LLM-->>MG: 3 drafts {question, options[4], correctIndex}
  MG-->>PS: McqDraft[]
  PS-->>L: drafts
  L->>API: POST /polls {chosen draft (edited)}
  API->>PS: create(sessionId, draft)
  L->>API: POST /polls/:id/open
  API->>PS: open(pollId)
  PS->>PB: update polls.status = open
  PB--)S: realtime -> phones switch to poll
  S->>API: POST /polls/:id/votes {optionIndex}
  API->>PS: vote(pollId, studentId, optionIndex)
  PS->>PB: create poll_votes (unique poll+student)
  PB--)P: realtime -> live bar chart
  L->>API: POST /polls/:id/close
  API->>PS: close(pollId)
  PS-->>P: results + correct answer revealed
```

## SD5: Lecture summary with confusion timeline (UC9)

```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer
  participant API as RecordingController
  participant RP as RecordingPipeline
  participant LS as LectureSummarizer
  participant LLM as LLMProvider
  participant CMt as ConfusionMeter
  participant PB as PocketBase

  L->>API: POST /sessions/:id/recordings (file, offsetSec)
  API->>RP: enqueue(sessionId, file, offsetSec)
  RP->>PB: create recordings {status: queued}
  API-->>L: 202 Accepted
  RP->>RP: process(recordingId) (async)
  RP->>PB: update status = processing
  PB--)L: realtime -> "processing"
  RP->>LS: summarize(media)
  LS->>LLM: generateStructured(task=summary, schema, media)
  alt media too long / provider error
    LS->>LS: fallback: audio -> transcript -> summarize
  end
  LLM-->>LS: {tldr, chapters[], concepts[], questions[]}
  LS-->>RP: LectureSummary
  RP->>PB: update {summary, status: done}
  PB--)L: realtime -> summary ready
  L->>API: GET /recordings/:id/timeline
  API->>RP: timelineSpikes(recordingId)
  RP->>CMt: series(sessionId, 60 s)
  CMt-->>RP: TimePoint[]
  RP-->>L: spikes shifted by offsetSec (overlaid on chapters)
```

## SD6: Homework review (UC10, UC11)

```mermaid
sequenceDiagram
  autonumber
  actor S as Student
  actor L as Lecturer
  participant API as HomeworkController
  participant HA as HomeworkAnalysisService
  participant TE as TextExtractor
  participant HR as HomeworkReviewer
  participant EP as EmbeddingProvider
  participant PB as PocketBase

  S->>API: POST /assignments/:id/submissions (file)
  API->>HA: submit(assignmentId, studentId, file)
  HA->>TE: extract(file)
  TE-->>HA: text
  HA->>HR: review(text, rubric)
  HR-->>HA: Review {criterionScores, strengths, fixes}
  HA->>EP: embed([text])
  EP-->>HA: vector
  HA->>PB: create submissions {review, scores, embedding}
  HA-->>S: review (percentiles shown once n >= 5)

  L->>API: POST /assignments/:id/insights
  API->>HA: buildInsights(assignmentId)
  HA->>PB: list submissions
  HA->>HA: PercentileCalculator per criterion
  HA->>HA: SimilarityAnalyzer.pairsAbove(vectors, 0.92)
  HA->>HR: common mistakes across reviews (LLM aggregate)
  HA->>PB: upsert assignment_insights + submissions.percentiles
  HA-->>L: distribution, common mistakes, similar pairs
```
