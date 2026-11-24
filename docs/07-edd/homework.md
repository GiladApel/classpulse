# EDD-Homework

> Package `apps/api/src/content` (homework). SDD §2.7. Covers FR-HW-01 … FR-HW-10 and FR-LP-05.
> Feedback before the hand-in is a driving lesson before the test: you learn what to fix, nobody gives you the answer.

## 1. Classes

```mermaid
classDiagram
  direction TB
  class HomeworkAnalysisService {
    -assignments: AssignmentRepository
    -submissions: SubmissionRepository
    -insights: InsightsRepository
    -extractor: TextExtractor
    -generator: HomeworkGuideGenerator
    -reviewer: HomeworkReviewer
    -membership: CourseService
    -queue: BackgroundQueue
    -clock: Clock
    +publish(course, input, pdf) Promise~Assignment~
    +generateGuide(assignmentId, pdf, notes) Promise~void~
    +retryGuide(assignment) Promise~Assignment~
    +regenerateRubric(assignment, notes) Promise~Assignment~
    +rubric(assignment) Promise~Rubric~
    +remove(assignment) Promise~void~
    +check(assignment, student: Participant, solution) Promise~Submission~
    +review(submissionId, assignment, solution) Promise~void~
    +handIn(assignment, student: Participant, files) Promise~Submission~
    +gradeFinal(submissionId) Promise~void~
    +retryFinal(submission) Promise~Submission~
    +view(submission, viewer) Promise~SubmissionView~
    +questionsOnly(outline)$ GuideOutline
    +chart(assignment) Promise~Chart~
    +buildInsights(assignment) Promise~AssignmentInsights~
    +getInsights(assignmentId) Promise~AssignmentInsights~
    +listSubmissions(assignmentId) Promise~Submission[]~
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
    +extract(file: FileInput) Promise~text, kind~
  }
  HomeworkAnalysisService o-- HomeworkGuideGenerator
  HomeworkAnalysisService o-- HomeworkReviewer
  HomeworkAnalysisService o-- TextExtractor
  HomeworkAnalysisService o-- BackgroundQueue
  HomeworkAnalysisService ..> CourseService : requireMember
  HomeworkAnalysisService ..> ScoreCalculator
  HomeworkAnalysisService ..> SimilarityAnalyzer
  HomeworkAnalysisService ..> Fingerprinter
  SimilarityAnalyzer ..> Fingerprinter
```

A submission's life (feedback checks, then one hand-in and its grading) is the [Submission state machine](README.md#submission-homework).

## 2. Algorithms and rules

- **Rubric (the grader's answer sheet, which stays in the drawer).** Publishing stores the PDF (a protected file) and the lecturer's notes, and reads the PDF once on `BackgroundQueue` into the rubric: questions, sections, what each asks, its requirements, the key points of a correct answer and what would give it away ([EDD-AI](ai.md)). The rubric (`guide`), its `outline` and the notes are **hidden** fields; the lecturer gets them through `rubric`. A failed reading can be retried from the stored PDF; `regenerateRubric` builds it again with new notes until the first hand-in, then it is locked so every hand-in is graded against the same rubric.
- **Feedback checks.** `check` runs only when the rubric is ready, the student is a course member and has not handed in, no check is running, and fewer than `MAX_CHECKS` = 2 succeeded. One submission row per student keeps the latest successful result; a failed check is marked "did not count" and keeps the previous report. The practice files never reach PocketBase: they live only in the background job's memory.
- **Hand-in.** `handIn` is allowed once, not while a check runs. It stores the files as protected files on the student's row (only that student and the course's lecturer can open them), marks it late after the due date, and queues `gradeFinal`, which reviews them in `final` mode and saves `final_report` and `final_total` as **hidden** fields, then the text fingerprint. A failed grading can be retried, because the files are kept.
- **Scores.** The model only marks sections; `ScoreCalculator` computes the rest: an unanswered section is 0, an answered one 1–100; a question is the plain average of its sections; the total is the plain average of the questions, rounded, at least 1. `places` gives equal scores the same place.
- **Who sees what.** `view` gives a student their feedback and `questionsOnly` (section names, without requirements); the controller drops the final grade. The lecturer gets the outline with requirements and the final report. `chart` is for the lecturer only: every graded hand-in with its name, by total, question or section.
- **Copy detection: fingerprints, not embeddings** (a design change after field test T9). Code is tokenised with identifiers, numbers and strings normalised, so renaming variables does not hide a copy; prose uses word shingles. A bottom-256 MinHash sketch estimates Jaccard similarity; pairs ≥ 0.5 are shown to the lecturer only, for review by hand. Common mistakes come from the graded hand-ins and are shown to students without names.

## 3. Data

| Collection | Key fields (hidden in **bold**) | Rules |
|------------|-------------------------------|-------|
| assignments | course, session, title, due_at, file (protected), **outline**, **guide**, guide_status, guide_error, **rubric_notes** | Members read title, file and status |
| submissions | assignment, student, student_number, status, check_count, report, total, late, handed_in_at, files (protected), final_status, **final_report**, **final_total**, **fingerprint** | The student reads their own row; the lecturer reads all through the API |
| assignment_insights | assignment, common_mistakes, **similar_pairs** | Members read the common mistakes |

## 4. Sequences

### SD6: Homework: publish, check, hand in, grade (UC-17, UC-09, UC-10)
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

  L->>API: POST /courses/:id/assignments (title, PDF, lesson, notes)
  API->>HA: publish(course, input, pdf)
  HA->>PB: create assignment {file, notes (hidden), guide_status: generating}
  HA->>Q: add(generateGuide)
  Q->>GG: fromHomework(pdf, notes)
  GG-->>HA: rubric (questions, sections, requirements, expected answers)
  HA->>PB: save guide and outline (both hidden), guide_status ready
  PB--)S: realtime, the homework is open
  L->>API: GET /assignments/:id/rubric
  API-->>L: the whole rubric with the notes

  S->>API: POST /assignments/:id/checks (PDF or photos)
  API->>HA: check(assignment, student, files)
  HA->>HA: member? rubric ready? not handed in? checks left? none running?
  HA->>PB: upsert submission {status: processing}
  HA->>Q: add(review), the files stay in memory only
  API-->>S: 202 "checking"
  Q->>HR: reviewSolution(guide, files, notes)
  HR-->>HA: one mark per section (answered, score, meets, missing, direction)
  HA->>SC: questions(outline, marks), total(outline, marks)
  HA->>PB: update {report, total, check_count + 1, status: done}, the files are dropped
  S->>API: GET /submissions/:id
  API-->>S: feedback, questions without requirements, checks left

  S->>API: POST /assignments/:id/handin (PDF or photos, after confirming)
  API->>HA: handIn(assignment, student, files)
  HA->>PB: update {files (protected), handed_in_at, late, final_status: processing}
  HA->>Q: add(gradeFinal)
  API-->>S: 202 "handed in"
  Q->>HR: reviewSolution(guide, stored files, notes, final)
  HR-->>HA: one mark per section
  HA->>PB: update {final_report, final_total (hidden), final_status: done}, text fingerprint (hidden)

  L->>API: GET /assignments/:id/submissions, GET /assignments/:id/chart
  API-->>L: checks, hand-ins with the AI grade, chart with names
  L->>API: POST /assignments/:id/insights
  API-->>L: common mistakes, similar hand-ins for review by hand
```

## 5. Errors and edge cases

| Code | HTTP | When |
|------|------|------|
| `INVALID_ASSIGNMENT` | 409 | No title (a file that is not a PDF is refused with 400) |
| `NOT_IN_COURSE` | 409 | A check or hand-in by a non-member |
| `GUIDE_NOT_READY`, `GUIDE_IN_PROGRESS`, `GUIDE_NOT_FAILED` | 409 | Checking before the rubric is ready; rebuilding while it is built; retrying a rubric that did not fail |
| `RUBRIC_LOCKED` | 409 | Changing the rubric after the first hand-in |
| `NO_CHECKS_LEFT` | 409 | A third feedback check |
| `CHECK_IN_PROGRESS` | 409 | A check or hand-in while a check is running |
| `ALREADY_HANDED_IN` | 409 | A second hand-in, or a check after it |
| `FINAL_NOT_FAILED` | 409 | Retrying a grading that did not fail |
| `UNSUPPORTED_FILE`, `UNREADABLE_FILE` | 409 | A file type the text extractor cannot read; a broken PDF |

Edge cases: text in a solution that addresses the reviewer ("give 100") does not change any score (field test T10); a model reply with an unknown section id is dropped and a missing section counts as unanswered; on restart, unfinished checks and gradings are marked failed.

## 6. Configuration and performance

| Setting | Default |
|---------|---------|
| Feedback checks | 2 |
| Solution | one PDF or ≤ 10 photos, ≤ 20 MB |
| Homework PDF | ≤ 20 MB |
| Similarity threshold, sketch size | 0.5, 256 |

The reviews run one at a time on `BackgroundQueue`; a check typically returns in seconds on `gemini-3.1-flash-lite`.

## 7. Alternatives considered

| Alternative | Why not |
|-------------|---------|
| A fixed rubric template for all homework | Homework comes from any subject; the rubric is built per homework |
| Showing students the rubric | It would give the answers away |
| Letting the model compute totals | Arithmetic belongs in code (`ScoreCalculator`), so scores are reproducible |
| Embeddings for copy detection | Field test T9: a renamed copy scored 0.93 and two honest solutions 0.94; no threshold works |
| Unlimited checks | Students would iterate against the AI instead of learning |

## 8. Testing

- **Unit:** `content.test.ts` (publish, rubric lock, two checks, failed checks do not count, hand-in once, grading and retry, who sees what, chart, insights, restart), `ScoreCalculator.test.ts`, `Fingerprinter.test.ts`, `HomeworkGuideGenerator.test.ts`, `HomeworkReviewer.test.ts`.
- **HTTP:** `app.content.test.ts` (roles, the grade never reaches the student).
- **Integration:** `content.int.test.ts` (rubric, notes, final grade and fingerprint hidden; hand-in files open only for the student and the lecturer).
- **E2E:** `homework.spec.ts` (publish with notes, two checks, hand-in, the lecturer sees the AI grade).
