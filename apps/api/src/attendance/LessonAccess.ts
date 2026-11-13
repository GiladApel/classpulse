import { DomainError } from '../shared/errors.js';
import type { AttendanceService } from './AttendanceService.js';
import type { CourseService } from './CourseService.js';
import type { SessionRepository } from './repositories.js';

/** Who may take part in a lesson (questions, upvotes, polls, "I'm lost"). */
export interface LessonParticipation {
  requireParticipant(sessionId: string, studentNumber: string): Promise<unknown>;
}

/**
 * A lesson is open to everyone in its course, in the room or at home: a student checked in to it, or any member of the
 * course (enrolled by the lecturer, or attended one of its lessons). Attendance itself still needs the QR in the room.
 */
export class LessonAccess implements LessonParticipation {
  constructor(
    private readonly attendance: Pick<AttendanceService, 'requireParticipant'>,
    private readonly sessions: Pick<SessionRepository, 'get'>,
    private readonly courses: Pick<CourseService, 'isMember'>,
  ) {}

  async requireParticipant(sessionId: string, studentNumber: string): Promise<void> {
    if (await this.attendance.requireParticipant(sessionId, studentNumber).then(() => true, () => false)) return;
    const session = await this.sessions.get(sessionId);
    if (session && (await this.courses.isMember(session.courseId, studentNumber))) return;
    throw new DomainError('NOT_IN_COURSE', 'את/ה לא רשום/ה לקורס הזה');
  }
}
