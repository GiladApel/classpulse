import type { Clock } from '../infra/Clock.js';
import { ConflictError, DomainError, NotFoundError } from '../shared/errors.js';
import type { AttendanceRepository, CourseRepository, CourseSlotRepository, EnrollmentRepository } from './repositories.js';
import { isEmail, normalizeEmail, type RosterParser, type RosterRow, type SkippedRow } from './RosterParser.js';
import type { StudentLinker } from './StudentLinker.js';
import type { Course, CourseSlot, Enrollment } from './types.js';

export interface SlotInput {
  weekday: number;
  starts: string;
  ends: string;
  room?: string;
}

export interface RosterImport {
  added: number;
  updated: number;
  skipped: SkippedRow[];
}

export const MAX_SLOTS = 14;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// A 9-digit ID from the roster, or a 12-digit key the system generated for a student who signed in by email.
const STUDENT_KEY = /^(\d{9}|\d{12})$/;

export interface NewEnrollment {
  email?: string;
  studentNumber?: string;
  name?: string;
}

/**
 * A course as the lecturer sets it up: who is enrolled (the roster) and when it meets (the weekly timetable).
 * A member of the course is a student on the roster or one who attended any of its sessions.
 */
export class CourseService {
  constructor(
    private readonly courses: CourseRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly slots: CourseSlotRepository,
    private readonly attendance: Pick<AttendanceRepository, 'attendedCourse'>,
    private readonly parser: Pick<RosterParser, 'fromText' | 'fromFile'>,
    private readonly linker: Pick<StudentLinker, 'linkRow'>,
    private readonly clock: Clock,
  ) {}

  async create(lecturerId: string, code: string, name: string): Promise<Course> {
    if (await this.courses.findByLecturerAndCode(lecturerId, code)) throw new ConflictError('COURSE_EXISTS', 'כבר יש לך קורס עם הקוד הזה');
    return this.courses.create({ code, name, lecturerId });
  }

  /**
   * Adds new students and fills in names and missing emails; never removes anyone (removing is a separate, deliberate
   * action). A row whose email belongs to a user who has already signed in is linked at once.
   */
  async importRoster(course: Course, source: { text: string } | { file: Buffer }): Promise<RosterImport> {
    const parsed = 'text' in source ? this.parser.fromText(source.text) : this.parser.fromFile(source.file);
    if (parsed.rows.length === 0) throw new DomainError('EMPTY_ROSTER', 'לא נמצאו בקובץ כתובות מייל או מספרי סטודנט');
    const result: RosterImport = { added: 0, updated: 0, skipped: parsed.skipped };
    for (const row of parsed.rows) {
      const existing = await this.findRow(course.id, row);
      if (!existing) {
        await this.linker.linkRow(await this.enrollments.create({ courseId: course.id, ...row, addedAt: this.clock.now() }));
        result.added++;
        continue;
      }
      const patch: Partial<Enrollment> = {};
      if (row.name && row.name !== existing.name) patch.name = row.name;
      if (row.email && !existing.email) patch.email = row.email;
      if (Object.keys(patch).length === 0) continue;
      await this.linker.linkRow(await this.enrollments.update(existing.id, patch));
      result.updated++;
    }
    return result;
  }

  /** One student, by email from the roster page or by key from "add" next to a check-in. Idempotent. */
  async enroll(course: Course, input: NewEnrollment): Promise<Enrollment> {
    const email = normalizeEmail(input.email ?? '');
    const studentNumber = (input.studentNumber ?? '').trim();
    if (email && !isEmail(email)) throw new DomainError('INVALID_EMAIL', 'כתובת המייל לא תקינה');
    if (studentNumber && !STUDENT_KEY.test(studentNumber)) throw new DomainError('INVALID_STUDENT_NUMBER', 'מספר סטודנט צריך להכיל 9 ספרות');
    if (!email && !studentNumber) throw new DomainError('INVALID_EMAIL', 'צריך כתובת מייל');
    const row: RosterRow = { email, studentNumber, name: (input.name ?? '').trim() };
    const existing = await this.findRow(course.id, row);
    if (existing) return existing;
    return this.linker.linkRow(await this.enrollments.create({ courseId: course.id, ...row, addedAt: this.clock.now() }));
  }

  /** Fixes a mistyped email; if that student has already signed in, they become a member at once. */
  async updateEmail(course: Course, enrollmentId: string, email: string): Promise<Enrollment> {
    const row = await this.ownRow(course, enrollmentId);
    const next = normalizeEmail(email);
    if (!isEmail(next)) throw new DomainError('INVALID_EMAIL', 'כתובת המייל לא תקינה');
    if (next === row.email) return row;
    const clash = await this.enrollments.findByCourseAndEmail(course.id, next);
    if (clash) throw new ConflictError('EMAIL_IN_ROSTER', 'המייל הזה כבר ברשימת הקורס');
    // The row now belongs to whoever signs in with the new email, so a link to the old one is dropped.
    return this.linker.linkRow(await this.enrollments.update(row.id, { email: next, studentNumber: row.email ? '' : row.studentNumber }));
  }

  async unenroll(course: Course, enrollmentId: string): Promise<void> {
    await this.enrollments.delete((await this.ownRow(course, enrollmentId)).id);
  }

  private async findRow(courseId: string, row: RosterRow): Promise<Enrollment | null> {
    return (await this.enrollments.findByCourseAndEmail(courseId, row.email)) ?? (await this.enrollments.findByCourseAndStudent(courseId, row.studentNumber));
  }

  private async ownRow(course: Course, enrollmentId: string): Promise<Enrollment> {
    const row = await this.enrollments.get(enrollmentId);
    if (!row || row.courseId !== course.id) throw new NotFoundError('Enrollment');
    return row;
  }

  roster(courseId: string): Promise<Enrollment[]> {
    return this.enrollments.listByCourse(courseId);
  }

  /** Replaces the whole weekly timetable and the term dates. */
  async setTimetable(course: Course, input: SlotInput[], term: { start?: Date; end?: Date } = {}): Promise<CourseSlot[]> {
    if (input.length > MAX_SLOTS) throw new DomainError('INVALID_TIMETABLE', `עד ${MAX_SLOTS} מפגשים בשבוע`);
    const slots = input.map((s) => {
      const valid = Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6 && TIME.test(s.starts) && TIME.test(s.ends);
      if (!valid) throw new DomainError('INVALID_TIMETABLE', 'יום או שעה לא תקינים');
      if (s.starts >= s.ends) throw new DomainError('INVALID_TIMETABLE', 'שעת הסיום חייבת להיות אחרי שעת ההתחלה');
      return { weekday: s.weekday, starts: s.starts, ends: s.ends, room: (s.room ?? '').trim().slice(0, 40) };
    });
    for (const a of slots) {
      // "HH:MM" strings compare in time order.
      const overlap = slots.some((b) => b !== a && b.weekday === a.weekday && a.starts < b.ends && b.starts < a.ends);
      if (overlap) throw new DomainError('TIMETABLE_OVERLAP', 'שני מפגשים חופפים באותו יום');
    }
    if (term.start && term.end && term.start > term.end) throw new DomainError('INVALID_TERM', 'סוף הסמסטר לפני תחילתו');
    await this.courses.update(course.id, { termStart: term.start, termEnd: term.end });
    return this.slots.replaceForCourse(course.id, slots);
  }

  async isMember(courseId: string, studentNumber: string): Promise<boolean> {
    if (!studentNumber) return false;
    return !!(await this.enrollments.findByCourseAndStudent(courseId, studentNumber)) || (await this.attendance.attendedCourse(courseId, studentNumber));
  }

  async requireMember(courseId: string, studentNumber: string): Promise<void> {
    if (!(await this.isMember(courseId, studentNumber))) throw new DomainError('NOT_IN_COURSE', 'את/ה לא רשום/ה לקורס הזה');
  }
}
