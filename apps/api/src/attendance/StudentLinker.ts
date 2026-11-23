import type { UserRepository } from '../admin/types.js';
import { normalizeEmail } from './RosterParser.js';
import type { EnrollmentRepository } from './repositories.js';
import type { Enrollment } from './types.js';

export interface LinkResult {
  studentNumber: string;
  /** Roster rows (one per course) that now belong to this user. */
  courses: number;
}

type Users = Pick<UserRepository, 'get' | 'findByEmail' | 'findByStudentNumber' | 'setStudentNumber'>;
type Rows = Pick<EnrollmentRepository, 'listByEmail' | 'findByCourseAndStudent' | 'update' | 'delete'>;
interface Student {
  id: string;
  email: string;
  studentNumber: string;
}

/** 12 digits, so a generated key never looks like (or collides with) a 9-digit student ID. */
export const randomStudentKey = () => Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');

/**
 * Students are identified by the email they sign in with. Every user gets a student key (their ID when the roster
 * gave one, otherwise a generated one) that attendance, polls and homework use, and every roster row with the
 * user's email gets that key, which is what makes the user a member of the course.
 */
export class StudentLinker {
  constructor(
    private readonly enrollments: Rows,
    private readonly users: Users,
    private readonly newKey: () => string = randomStudentKey,
  ) {}

  /** After sign-in: gives the user a key and links their roster rows. Idempotent. */
  async link(signedIn: Student): Promise<LinkResult> {
    // The stored user, not the caller's copy: a second call must see the key the first one wrote.
    const user = (await this.users.get(signedIn.id)) ?? signedIn;
    const rows = await this.enrollments.listByEmail(normalizeEmail(user.email));
    const studentNumber = await this.keyFor(user, rows.find((r) => r.studentNumber)?.studentNumber ?? '');
    let courses = 0;
    for (const row of rows) if (await this.attach(row, studentNumber)) courses++;
    return { studentNumber, courses };
  }

  /** After the lecturer adds a row or fixes its email: links it at once if that user has already signed in. */
  async linkRow(row: Enrollment): Promise<Enrollment> {
    if (!row.email) return row;
    const user = await this.users.findByEmail(row.email);
    if (!user || user.role === 'lecturer') return row;
    const studentNumber = await this.keyFor(user, row.studentNumber);
    return (await this.attach(row, studentNumber)) ?? row;
  }

  private async keyFor(user: Student, rosterId: string): Promise<string> {
    if (user.studentNumber) return user.studentNumber;
    let key = rosterId && !(await this.users.findByStudentNumber(rosterId)) ? rosterId : '';
    while (!key) {
      const candidate = this.newKey();
      if (!(await this.users.findByStudentNumber(candidate))) key = candidate;
    }
    await this.users.setStudentNumber(user.id, key);
    user.studentNumber = key;
    return key;
  }

  /**
   * Writes the key into the row. If the course already has a row with that key (an older ID-only row for the same
   * student), the two rows are merged: the older row keeps its place and gains the email.
   */
  private async attach(row: Enrollment, studentNumber: string): Promise<Enrollment | null> {
    if (row.studentNumber === studentNumber) return row;
    const other = await this.enrollments.findByCourseAndStudent(row.courseId, studentNumber);
    if (other && other.id !== row.id) {
      await this.enrollments.delete(row.id);
      return other.email ? other : this.enrollments.update(other.id, { email: row.email, name: other.name || row.name });
    }
    return this.enrollments.update(row.id, { studentNumber });
  }
}
