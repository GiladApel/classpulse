import type { CourseService } from '../attendance/CourseService.js';
import type { Session } from '../attendance/types.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError } from '../shared/errors.js';
import type { LessonFeedbackRepository } from './repositories.js';
import { FEEDBACK_RATINGS, type FeedbackRating, type FeedbackStatus, type FeedbackSummary, type Participant } from './types.js';

/** Comments on a lecture open when it ends and close a week later, so students who watched it later can still comment. */
export const FEEDBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Below this the lecturer sees only the count: with one or two answers, the author is easy to guess. */
export const MIN_FEEDBACK_RESPONSES = 3;

/**
 * Anonymous comments on a lecture (FR-FB-01..03): one optional answer per course member, whether or not they attended.
 * Nobody can read the records through PocketBase; the lecturer gets only the aggregate from `summary`.
 */
export class FeedbackService {
  constructor(
    private readonly feedback: LessonFeedbackRepository,
    private readonly courses: Pick<CourseService, 'requireMember'>,
    private readonly clock: Clock,
  ) {}

  async status(session: Session, student: Participant): Promise<FeedbackStatus> {
    const closesAt = this.closesAt(session);
    const participant = await this.courses.requireMember(session.courseId, student.studentNumber).then(
      () => true,
      () => false,
    );
    if (!participant) return { open: false, submitted: false, closesAt };
    const submitted = !!(await this.feedback.find(session.id, student.studentNumber));
    return { open: !submitted && !!closesAt && this.clock.now() < closesAt, submitted, closesAt };
  }

  async submit(session: Session, student: Participant, rating: FeedbackRating, comment: string): Promise<void> {
    const closesAt = this.closesAt(session);
    if (!closesAt) throw new DomainError('FEEDBACK_NOT_OPEN', 'המשוב ייפתח בסוף השיעור');
    if (this.clock.now() >= closesAt) throw new DomainError('FEEDBACK_CLOSED', 'זמן המשוב על השיעור הזה הסתיים');
    if (!FEEDBACK_RATINGS.includes(rating)) throw new DomainError('INVALID_OPTION', 'אין תשובה כזו');
    await this.courses.requireMember(session.courseId, student.studentNumber);
    if (await this.feedback.find(session.id, student.studentNumber)) throw new DomainError('ALREADY_SENT', 'כבר שלחת משוב על השיעור הזה');
    try {
      await this.feedback.create({
        sessionId: session.id,
        studentId: student.id,
        studentNumber: student.studentNumber,
        rating,
        comment: comment.trim(),
        submittedAt: this.clock.now(),
      });
    } catch {
      throw new DomainError('ALREADY_SENT', 'כבר שלחת משוב על השיעור הזה');
    }
  }

  /** Comments are grouped by option and sorted by text, never by time, so their order says nothing about who wrote them. */
  async summary(sessionId: string): Promise<FeedbackSummary> {
    const all = await this.feedback.listBySession(sessionId);
    if (all.length < MIN_FEEDBACK_RESPONSES) return { responses: all.length, visible: false, counts: null, comments: [] };
    const counts = Object.fromEntries(FEEDBACK_RATINGS.map((r) => [r, all.filter((f) => f.rating === r).length])) as Record<FeedbackRating, number>;
    const comments = all
      .filter((f) => f.comment)
      .map((f) => ({ rating: f.rating, text: f.comment }))
      .sort((a, b) => FEEDBACK_RATINGS.indexOf(a.rating) - FEEDBACK_RATINGS.indexOf(b.rating) || a.text.localeCompare(b.text, 'he'));
    return { responses: all.length, visible: true, counts, comments };
  }

  private closesAt(session: Session): Date | null {
    return session.status === 'ended' && session.endedAt ? new Date(session.endedAt.getTime() + FEEDBACK_WINDOW_MS) : null;
  }
}
