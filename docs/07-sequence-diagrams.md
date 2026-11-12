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
  loop rules in order: DuplicateStudent, Token, SessionActive, DeviceBinding, Geofence
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
  CM->>CM: challenge.start(now, 45)  [pending -> active]
  CM->>PB: create challenges {active, blurred_image, expires_at = now + 45 s}
  PB--)S: realtime "create" (listRule: checked-in students only)
  PB--)L: realtime "create" -> clear photo + heatmap layer

  loop each student until expires_at
    S->>S: show blurred photo + countdown, student taps seat
    S->>API: POST /challenges/:id/responses {x, y}
    API->>CM: submitResponse(challengeId, studentId, tap)
    CM->>CM: challenge.accept(r, {eligible, alreadyAnswered, now})
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
  CM->>CM: RollCallChallenge.validatePayload: token valid for this challenge?
  CM->>PB: create challenge_responses {rollcall_token_ok: true}
  CM->>CM: closeExpired(): evaluate() -> missing = no_response
  CM->>PB: flag missing students
  PB--)L: realtime -> flagged list
```

## SD4: AI poll from slide (UC8, UC7)

```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer dashboard
  participant API as PollController
  participant PS as PollService
  participant MG as McqGenerator
  participant LLM as LLMProvider
  participant AS as AttendanceService
  participant PB as PocketBase
  actor S as Checked-in students
  participant P as Projector view

  L->>API: POST /polls/drafts (slide image: camera or upload)
  API->>PS: draftFromSlide(slide)
  PS->>MG: fromSlide(slide)
  MG->>LLM: generateStructured(task=generate_mcq, schema, slide)
  LLM-->>MG: {questions[]}
  MG-->>PS: McqDraft[] (≤3, invalid ones dropped)
  PS-->>L: drafts
  L->>L: pick one, edit text / correct answer
  L->>API: POST /sessions/:id/polls {question, options, correctIndex, source: ai, open: true}
  API->>PS: create(session, draft, ai)
  API->>PS: open(session, pollId)
  PS->>PB: close any open poll, then polls.status = open
  PB--)S: realtime "update" (list rule: checked-in, not draft) -> phone shows the poll
  PB--)P: realtime -> projector switches to live bars
  S->>API: POST /polls/:id/votes {optionIndex}
  API->>PS: vote(pollId, participant, optionIndex)
  PS->>AS: requireParticipant(sessionId, studentNumber)
  PS->>PB: create poll_votes (unique poll + student)
  PB--)P: realtime -> bar grows
  L->>API: POST /polls/:id/close
  API->>PS: close(pollId)
  PS->>PB: update {status: closed, results, answer_index}
  PB--)S: realtime -> results with ✓ on the correct option
  PB--)P: realtime -> answer revealed (shown for 60 s)
```

## SD5: Lecture summary with confusion timeline (UC9)

```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer dashboard
  participant API as ContentController
  participant RP as RecordingPipeline
  participant US as UploadStore
  participant Q as BackgroundQueue
  participant LS as LectureSummarizer
  participant LLM as GeminiProvider
  participant CMt as ConfusionMeter
  participant PB as PocketBase

  L->>API: POST /sessions/:id/recordings {filename, mimeType, sizeBytes, offsetSec}
  API->>RP: start(session, meta)
  RP->>PB: create recordings {status: uploading}
  API-->>L: {id, chunkBytes: 50 MB}
  loop each 50 MB chunk (Cloudflare caps requests at 100 MB)
    L->>API: PUT /recordings/:id/data?offset=n (raw bytes)
    API->>RP: appendChunk(recording, n, bytes)
    RP->>US: append(id, n, bytes) (repeat ignored, gap rejected)
    API-->>L: {received}
  end
  L->>API: POST /recordings/:id/complete
  API->>RP: complete(recording)
  RP->>PB: update status = queued
  RP->>Q: add(process)
  API-->>L: 202 Accepted
  Q->>RP: process(recordingId)
  RP->>PB: update status = processing
  PB--)L: realtime -> "processing"
  RP->>LS: summarize({media: path} or {transcript})
  LS->>LLM: generateStructured(task=summarize_lecture, schema, video)
  LLM->>LLM: Files API upload, wait until ACTIVE, low media resolution
  LLM-->>LS: {tldr, chapters[startSec], concepts[], questions[5]}
  LS-->>RP: LectureSummary (validated, chapters sorted)
  RP->>PB: update {summary, status: done}
  RP->>US: remove(id) (the recording is never kept)
  PB--)L: realtime -> summary ready
  L->>API: GET /recordings/:id/timeline
  API->>RP: timeline(session, recording)
  RP->>CMt: series(sessionId, startedAt, endedAt, 60 s)
  CMt-->>RP: TimePoint[]
  RP-->>L: buckets shifted by offsetSec + spikes labelled with their chapter
  L->>API: POST /recordings/:id/publish {published: true}
  Note over PB: list rule now lets every course participant read the summary
```

## SD6: Homework: publish, check, report (UC11, UC10)

```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer
  actor S as Student
  participant API as HomeworkController
  participant HA as HomeworkAnalysisService
  participant Q as BackgroundQueue
  participant GG as HomeworkGuideGenerator
  participant HR as HomeworkReviewer
  participant SC as ScoreCalculator
  participant PB as PocketBase

  L->>API: POST /courses/:id/assignments (title, PDF, lesson)
  API->>HA: publish(course, input, pdf)
  HA->>PB: create assignment {file, guide_status: generating}
  HA->>Q: add(generateGuide)
  Q->>GG: fromHomework(pdf)
  GG-->>HA: ReviewGuide (questions, sections, requirements, expected answers)
  HA->>PB: save guide (hidden) and outline, guide_status ready
  PB--)S: realtime, the homework is open for checking

  S->>API: POST /assignments/:id/checks (PDF or photos)
  API->>HA: check(assignment, student, files)
  HA->>HA: course member? guide ready? checks left? none running?
  HA->>PB: upsert submission {status: processing}
  HA->>Q: add(review), the files stay in memory only
  API-->>S: 202 "checking"
  Q->>HR: reviewSolution(guide, files)
  HR-->>HA: one mark per section (answered, score, meets, missing, direction)
  HA->>SC: questions(outline, marks), total(outline, marks)
  HA->>PB: update {report, total, check_count + 1, status: done}
  HA->>PB: save the text fingerprint (hidden), the files are dropped
  PB--)S: realtime, status done
  S->>API: GET /submissions/:id and GET /assignments/:id/chart
  API-->>S: report, checks left, place, anonymous chart (from 3 checked)

  L->>API: GET /assignments/:id/chart, POST /assignments/:id/insights
  API-->>L: chart with names, common mistakes, similar pairs for review by hand
```

## SD7: "I'm lost" and the questions feed (UC6)

```mermaid
sequenceDiagram
  autonumber
  actor S as Student phone
  participant API as EngagementController
  participant CMt as ConfusionMeter
  participant FS as FeedService
  participant AS as AttendanceService
  participant PB as PocketBase
  actor L as Lecturer dashboard

  S->>API: POST /sessions/:id/lost
  API->>CMt: record(session, participant)
  CMt->>AS: requireParticipant(sessionId, studentNumber)
  CMt->>PB: last signal of this student
  alt within 60 s cooldown
    CMt-->>S: {accepted: false, retryInSec}
  else
    CMt->>PB: create lost_signals {student hidden, at}
    PB--)L: realtime "create" (no identity)
    L->>API: GET /sessions/:id/confusion
    API->>CMt: level(sessionId, 120)
    CMt-->>L: {lost, present, ratio}
  end

  S->>API: POST /sessions/:id/posts {text, anonymous}
  API->>FS: post(session, participant, text, anonymous)
  FS->>PB: create feed_posts {author hidden, display_name only if not anonymous}
  PB--)L: realtime -> new question
  PB--)S: realtime -> other students see it
  S->>API: POST /posts/:id/votes
  API->>FS: upvote(postId, participant)
  FS->>PB: create post_votes (unique post + voter)
  FS->>PB: votes + 1 (serialised per post by KeyedLock)
  L->>API: POST /sessions/:id/themes
  API->>FS: clusterOpen(sessionId)
  FS-->>L: Theme[] (AI groups open questions)
```

## SD8: Entering a live lesson from home (UC20)

```mermaid
sequenceDiagram
  autonumber
  actor S as Student phone (home)
  participant PB as PocketBase
  participant API as AttendanceController
  participant AS as AttendanceService
  actor L as Lecturer (attendance tab)

  S->>PB: list my enrollments, course_slots, active sessions of my courses
  PB-->>S: rows the view rules allow (own roster row, member courses)
  PB--)S: realtime, a session of my course becomes active
  S->>S: home shows "Lesson live now" and the weekly timetable
  S->>S: tap the live lesson, open /lesson/:id (attendance tab: scan the code)
  S->>S: camera scans the projected QR, opens /c/:token
  S->>API: POST /checkins {token, deviceId, location}
  API->>AS: checkIn(ctx) (rule chain of SD1)
  AS->>PB: create attendance_records
  PB--)L: realtime "create", row in the attendance list
  AS-->>S: record, the app opens the lesson's forum tab with a confirmation
```

## SD9: Uploading the course roster (UC18)

```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer (course page, students tab)
  participant API as CourseController
  participant SS as SessionService
  participant CS as CourseService
  participant RP as RosterParser
  participant PB as PocketBase
  actor S as Student (later)

  L->>API: POST /courses/:id/roster (Excel or CSV file, or pasted text)
  API->>SS: getOwnedCourse(courseId, lecturerId)
  API->>CS: importRoster(course, file)
  CS->>RP: fromFile(data)
  RP-->>CS: rows (ID padded to 9 digits, name) and skipped lines
  loop each row
    CS->>PB: create enrollment, or update the name if it changed
  end
  CS-->>L: added N, updated M, skipped lines
  PB--)L: realtime, the roster table fills in
  S->>PB: sign in once (Google + student ID)
  PB-->>S: own enrollment row, so the course appears on the home screen
```
