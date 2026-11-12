import type { Clock } from '../infra/Clock.js';
import { ConflictError, DomainError, NotFoundError } from '../shared/errors.js';
import type { AttendanceRepository, CourseRepository, CourseSlotRepository, EnrollmentRepository } from './repositories.js';
import type { RosterParser, SkippedRow } from './RosterParser.js';
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
const STUDENT_NUMBER = /^\d{9}$/;

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
    private readonly clock: Clock,
  ) {}

  async create(lecturerId: string, code: string, name: string): Promise<Course> {
    if (await this.courses.findByLecturerAndCode(lecturerId, code)) throw new ConflictError('COURSE_EXISTS', 'כבר יש לך קורס עם הקוד הזה');
    return this.courses.create({ code, name, lecturerId });
  }

  /** Adds new students and updates names; never removes anyone (removing is a separate, deliberate action). */
  async importRoster(course: Course, source: { text: string } | { file: Buffer }): Promise<RosterImport> {
    const parsed = 'text' in source ? this.parser.fromText(source.text) : this.parser.fromFile(source.file);
    if (parsed.rows.length === 0) throw new DomainError('EMPTY_ROSTER', 'לא נמצאו בקובץ מספרי סטודנט');
    const result: RosterImport = { added: 0, updated: 0, skipped: parsed.skipped };
    for (const row of parsed.rows) {
      const existing = await this.enrollments.findByCourseAndStudent(course.id, row.studentNumber);
      if (!existing) {
        await this.enrollments.create({ courseId: course.id, studentNumber: row.studentNumber, name: row.name, addedAt: this.clock.now() });
        result.added++;
      } else if (row.name && row.name !== existing.name) {
        await this.enrollments.update(existing.id, { name: row.name });
        result.updated++;
      }
    }
    return result;
  }

  /** One student, e.g. "add" next to a check-in from someone not on the roster. Idempotent. */
  async enroll(course: Course, studentNumber: string, name: string): Promise<Enrollment> {
    if (!STUDENT_NUMBER.test(studentNumber)) throw new DomainError('INVALID_STUDENT_NUMBER', 'מספר סטודנט צריך להכיל 9 ספרות');
    const existing = await this.enrollments.findByCourseAndStudent(course.id, studentNumber);
    if (existing) return existing;
    return this.enrollments.create({ courseId: course.id, studentNumber, name: name.trim(), addedAt: this.clock.now() });
  }

  async unenroll(course: Course, studentNumber: string): Promise<void> {
    const existing = await this.enrollments.findByCourseAndStudent(course.id, studentNumber);
    if (!existing) throw new NotFoundError('Enrollment');
    await this.enrollments.delete(existing.id);
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
