# EDD-Courses

> Courses, rosters, identity by email, the weekly timetable, who may take part in a lesson, and admins.
> Packages `apps/api/src/attendance` (`CourseService`, `RosterParser`, `StudentLinker`, `LessonAccess`) and
> `apps/api/src/admin`. SDD §2.4. Covers FR-AD-01, FR-AD-02, FR-EN-01 … FR-EN-05, FR-TT-01 … FR-TT-04, FR-BC-05.

## 1. Classes

```mermaid
classDiagram
  direction TB
  class CourseService {
    -courses: CourseRepository
    -enrollments: EnrollmentRepository
    -slots: CourseSlotRepository
    -attendance: AttendanceRepository
    -parser: RosterParser
    -linker: StudentLinker
    -clock: Clock
    +create(lecturerId, code, name) Promise~Course~
    +importRoster(course, text or file) Promise~RosterImport~
    +enroll(course, input: NewEnrollment) Promise~Enrollment~
    +updateEmail(course, enrollmentId, email) Promise~Enrollment~
    +unenroll(course, enrollmentId) Promise~void~
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
  class RosterRow {
    +email: string
    +studentNumber: string
    +name: string
  }
  class StudentLinker {
    -enrollments: EnrollmentRepository
    -users: UserRepository
    -newKey: () string
    +link(user) Promise~LinkResult~
    +linkRow(row: Enrollment) Promise~Enrollment~
  }
  class LessonParticipation {
    <<interface>>
    +requireParticipant(sessionId, studentNumber) Promise~unknown~
  }
  class LessonAccess {
    -attendance: AttendanceService
    -sessions: SessionRepository
    -courses: CourseService
    +requireParticipant(sessionId, studentNumber) Promise~void~
  }
  class EnrollmentRepository {
    <<interface>>
    +findByCourseAndStudent(courseId, studentNumber) Promise~Enrollment~
    +findByCourseAndEmail(courseId, email) Promise~Enrollment~
    +listByEmail(email) Promise~Enrollment[]~
    +listByCourse(courseId) Promise~Enrollment[]~
    +delete(id) Promise~void~
  }
  class UserRepository {
    <<interface>>
    +get(id) Promise~ManagedUser~
    +search(q, limit) Promise~ManagedUser[]~
    +setRole(id, role) Promise~ManagedUser~
    +findByEmail(email) Promise~ManagedUser~
    +findByStudentNumber(studentNumber) Promise~ManagedUser~
    +setStudentNumber(id, studentNumber) Promise~ManagedUser~
  }
  class UserAdminService {
    -users: UserRepository
    -admins: Set~string~
    +isAdmin(email) boolean
    +search(q) Promise~ManagedUser[]~
    +setRole(actorId, userId, role: Role) Promise~ManagedUser~
  }
  class CourseController {
    -courses: CourseService
    -sessions: SessionService
    -linker: StudentLinker
    +routes() Hono
  }
  class AdminController {
    -admins: UserAdminService
    +routes() Hono
  }

  CourseService o-- RosterParser
  CourseService o-- StudentLinker : linkRow
  CourseService ..> EnrollmentRepository
  RosterParser ..> RosterRow
  StudentLinker ..> EnrollmentRepository
  StudentLinker ..> UserRepository
  LessonParticipation <|.. LessonAccess
  LessonAccess ..> CourseService : isMember
  UserAdminService o-- UserRepository
  CourseController o-- CourseService
  CourseController o-- StudentLinker : link
  AdminController o-- UserAdminService
```

## 2. Algorithms and rules

**Identity by email (the guest list at the door).** A student is known by the email they sign in with.
- Every user gets a **student key** (`users.student_id`) the first time `StudentLinker.link` runs (the web app calls `POST /me/link` right after sign-in): the 9-digit ID of a roster row with their email if no other user has it, otherwise the key they already have, otherwise a generated 12-digit key (12 digits, so it never looks like or collides with a real ID).
- `link` then writes that key into every roster row with the user's email. Membership in PocketBase rules compares `enrollments.student_number` with `@request.auth.student_id`, so writing the key is what opens the course. Rules also require the key to be non-empty, so an unlinked row (empty key) never matches a user without a key.
- `linkRow` does the same for one row when the lecturer adds it or fixes its email and that student has already signed in, so a fix takes effect at once. A lecturer's email is never linked.
- If the course already has an older ID-only row with the same key, the two rows are merged: the older row keeps its place and gains the email.
- `link` reads the stored user, not the caller's copy, so a second call cannot generate a second key (idempotent).

**Roster import (`RosterParser`).** One student per row, columns in any order: an email (validated, lowercased), an optional ID (5–9 digits, padded back to 9 because Excel drops leading zeros) and the name (the other cells). A row needs an email or an ID. Reads pasted text (tab, comma, semicolon or spaces), CSV/TSV in UTF-8 or Windows-1255, and the first sheet of an Excel file. Bad emails, rows with neither, and repeats (same email in any case, or same ID) are reported by line. An import adds rows and fills in names and missing emails; it never removes.

**Membership.** A course member is a student on the roster (linked) or one who attended any lesson of the course (`CourseService.isMember`, mirrored in PocketBase view rules). `LessonAccess.requireParticipant` admits a student checked in to the lesson or any course member, so a live lesson's forum, polls and "I'm lost" are open to the whole course (FR-BC-05); otherwise `NOT_IN_COURSE`.

**Timetable.** `setTimetable` replaces the weekly slots as a whole; times are `HH:MM`, a slot must end after it starts, and two slots on one day may not overlap (string comparison of `HH:MM` is time order).

**Admins.** Not a database role: `ADMIN_EMAILS` in the server configuration lists them, so nobody can make themselves an admin, and the `users` update rule stops users from changing their own `role`. An admin cannot change their own role, so the last admin cannot lock themselves out.

## 3. Data

| Collection | Key fields | Rules |
|------------|-----------|-------|
| users | email, name, student_id (unique when set), role | A user reads themselves, lecturers read users (to show who signed in); a user cannot change their own `role`, and may set `student_id` only while it is empty |
| courses | code, name, lecturer, term_start, term_end | Unique (lecturer, code) |
| enrollments | course, email, student_number, name, added_at | Unique (course, email) and (course, student_number), each when not empty; the lecturer reads all, a student only their own linked row |
| course_slots | course, weekday, starts, ends, room | Read by members and the lecturer |

## 4. Sequences

### SD9: Uploading the course roster (UC-19)
```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer (course page, students tab)
  participant API as CourseController
  participant SS as SessionService
  participant CS as CourseService
  participant RP as RosterParser
  participant SL as StudentLinker
  participant PB as PocketBase

  L->>API: POST /courses/:id/roster (Excel or CSV file, or pasted text)
  API->>SS: getOwnedCourse(courseId, lecturerId)
  API->>CS: importRoster(course, file)
  CS->>RP: fromFile(data)
  RP-->>CS: rows (email, optional ID, name) and skipped lines
  loop each row
    CS->>PB: create the row, or fill in its name and missing email
    CS->>SL: linkRow(row)
    SL->>PB: user with this email? then write their key into the row
  end
  CS-->>L: added N, updated M, skipped lines
  PB--)L: realtime, the table fills in, rows still waiting for a sign-in are highlighted
```

### SD10: First sign-in, linked by email (UC-01 2a, UC-05)
```mermaid
sequenceDiagram
  autonumber
  actor S as Student phone
  participant PB as PocketBase
  participant API as CourseController
  participant SL as StudentLinker
  participant U as UserRepository
  participant E as EnrollmentRepository

  S->>PB: sign in with Google
  PB-->>S: token, user without a student key
  S->>API: POST /me/link
  API->>SL: link(user)
  SL->>U: get(user.id) (the stored user)
  SL->>E: listByEmail(email)
  E-->>SL: roster rows in every course
  alt a row has an ID no other user has
    SL->>U: setStudentNumber(id, roster ID)
  else no usable ID
    SL->>U: setStudentNumber(id, generated 12-digit key)
  end
  loop each row
    SL->>E: update(row, studentNumber = key), or merge into an older ID row
  end
  SL-->>API: {studentNumber, courses}
  API-->>S: 200
  S->>PB: authRefresh (the token now carries the key)
  PB-->>S: the courses now pass the view rules, so the home screen lists them
```

### SD11: Fixing an unmatched email (UC-20)
```mermaid
sequenceDiagram
  autonumber
  actor L as Lecturer
  participant API as CourseController
  participant CS as CourseService
  participant SL as StudentLinker
  participant PB as PocketBase
  actor S as Student

  L->>API: PUT /courses/:id/enrollments/:eid {email}
  API->>CS: updateEmail(course, eid, email)
  CS->>CS: valid email? not already on this roster?
  CS->>PB: update {email, student_number: cleared}
  CS->>SL: linkRow(row)
  SL->>PB: the user with this email signed in? write their key
  PB--)L: realtime, the row shows the student's name
  S->>PB: refresh, the course appears
```

### SD8: Entering a live lesson from home (UC-05)
```mermaid
sequenceDiagram
  autonumber
  actor S as Student phone (home)
  participant PB as PocketBase
  participant API as EngagementController
  participant LA as LessonAccess

  S->>PB: list my enrollments, course_slots, active sessions of my courses
  PB-->>S: rows the view rules allow (own roster row, member courses)
  PB--)S: realtime, a lesson of my course becomes active
  S->>S: home shows "lesson live now" and the weekly timetable
  S->>S: tap the live lesson, it opens on the forum tab
  S->>API: POST /sessions/:id/posts {text}
  API->>LA: requireParticipant(sessionId, key)
  LA-->>API: a course member, so allowed without checking in
  API-->>S: 201, the question appears for everyone
  Note over S: in the room the student scans the QR to be marked present (SD1)
```

## 5. Errors and edge cases

| Code | HTTP | When |
|------|------|------|
| `COURSE_EXISTS` | 409 | The lecturer already has a course with this code |
| `EMPTY_ROSTER` | 409 | No row with an email or an ID |
| `INVALID_EMAIL` | 409 | A bad email, or neither an email nor an ID in `enroll` |
| `INVALID_STUDENT_NUMBER` | 409 | A key that is not 9 or 12 digits |
| `EMAIL_IN_ROSTER` | 409 | Fixing a row to an email already on the roster |
| `INVALID_TIMETABLE`, `TIMETABLE_OVERLAP`, `INVALID_TERM` | 409 | Bad day or time, overlapping slots, term end before start |
| `NOT_IN_COURSE` | 409 | Taking part in a lesson of a course you are not a member of |
| `OWN_ROLE` | 409 | An admin changing their own role |
| `NOT_FOUND` | 404 | A row of another course, a user that does not exist |

Edge cases: a roster ID that another user already has (a typo) gets a generated key, and the other user keeps theirs; moving a row to another email clears its link; an email in different case is the same student.

## 6. Configuration and performance

| Setting | Default | Where |
|---------|---------|-------|
| `ADMIN_EMAILS` | — | server env |
| Roster file | ≤ 5 MB | `CourseController` |
| Generated key | 12 digits | `StudentLinker` |

`link` reads the user's rows by email with one indexed query and updates at most one row per course.

## 7. Alternatives considered

| Alternative | Why not |
|-------------|---------|
| The student types an ID on first visit (the design until M14) | One more step, and a typo links the wrong person; the lecturer asked for email |
| Email as the key in every record | Every collection would change; the key stays internal and only the roster matches by email |
| Inviting students by an emailed link | Needs mail delivery and a second step; Google sign-in already proves the email |

## 8. Testing

- **Unit:** `RosterParser.test.ts` (emails, IDs, Hebrew CSV, Excel, duplicates, bad emails), `StudentLinker.test.ts` (new key, case, roster ID, taken ID, merge, idempotent, `linkRow`), `CourseService.test.ts` (import links at once, fix email, membership, timetable), `UserAdminService.test.ts`.
- **HTTP:** `app.course.test.ts` (routes, roles, `/me/link`), `app.admin.test.ts`.
- **Integration:** `enrollment.int.test.ts` (an email row opens the course only to its linked student; an empty key never matches), `admin.int.test.ts`.
- **E2E:** `enrollment.spec.ts` (course setup, live lesson from home, a mistyped email fixed by the lecturer).
