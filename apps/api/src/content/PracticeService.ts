import type { Attachment } from '../ai/LLMProvider.js';
import type { McqGenerator } from '../ai/McqGenerator.js';
import type { AttendanceService } from '../attendance/AttendanceService.js';
import type { Session } from '../attendance/types.js';
import { PollService } from '../engagement/PollService.js';
import type { McqDraft, Participant } from '../engagement/types.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import type { PracticeAnswerRepository, PracticeQuestionRepository } from './repositories.js';
import type { PracticeAnswer, PracticeQuestion } from './types.js';

/**
 * Practice questions on a lecture page (FR-LP-02). Unlike a poll there is no live phase: any course participant
 * answers once, whenever they like, and only then learns the correct answer (hidden from PocketBase reads until then).
 */
export class PracticeService {
  constructor(
    private readonly questions: PracticeQuestionRepository,
    private readonly answers: PracticeAnswerRepository,
    private readonly attendance: Pick<AttendanceService, 'requireCourseParticipant'>,
    private readonly generator: Pick<McqGenerator, 'fromLecture'>,
    private readonly clock: Clock,
  ) {}

  /** AI drafts from the lecture's slide deck; nothing is saved until the lecturer adds the ones they want. */
  draftFromLecture(deck: Attachment): Promise<McqDraft[]> {
    return this.generator.fromLecture(deck);
  }

  async add(session: Session, draft: McqDraft, source: PracticeQuestion['source']): Promise<PracticeQuestion> {
    const { question, options, correctIndex } = PollService.normalizeDraft(draft);
    if (correctIndex === null) throw new DomainError('INVALID_POLL', 'יש לסמן את התשובה הנכונה');
    return this.questions.create({ sessionId: session.id, question, options, correctIndex, source, createdAt: this.clock.now() });
  }

  /** For the lecturer, with correct answers (hidden from PocketBase reads). */
  list(sessionId: string): Promise<PracticeQuestion[]> {
    return this.questions.listBySession(sessionId);
  }

  async remove(questionId: string): Promise<void> {
    await this.get(questionId);
    await this.questions.delete(questionId);
  }

  async answer(session: Session, questionId: string, student: Participant, optionIndex: number): Promise<PracticeAnswer> {
    const q = await this.get(questionId);
    if (q.sessionId !== session.id) throw new NotFoundError('Question');
    await this.attendance.requireCourseParticipant(session.courseId, student.studentNumber);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= q.options.length) throw new DomainError('INVALID_OPTION', 'אין תשובה כזו');
    if (await this.answers.find(questionId, student.studentNumber)) throw new DomainError('ALREADY_ANSWERED', 'כבר ענית על השאלה הזו');
    try {
      return await this.answers.create({
        questionId,
        studentId: student.id,
        studentNumber: student.studentNumber,
        optionIndex,
        correct: optionIndex === q.correctIndex,
        correctIndex: q.correctIndex,
        answeredAt: this.clock.now(),
      });
    } catch {
      // A concurrent request from the same student won; the unique index rejected this one.
      throw new DomainError('ALREADY_ANSWERED', 'כבר ענית על השאלה הזו');
    }
  }

  async get(questionId: string): Promise<PracticeQuestion> {
    const q = await this.questions.get(questionId);
    if (!q) throw new NotFoundError('Question');
    return q;
  }
}
