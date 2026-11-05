import type { Attachment } from '../ai/LLMProvider.js';
import type { McqGenerator } from '../ai/McqGenerator.js';
import type { AttendanceService } from '../attendance/AttendanceService.js';
import type { Session } from '../attendance/types.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import type { PollRepository, PollVoteRepository } from './repositories.js';
import type { McqDraft, Participant, Poll, PollResults, PollSource } from './types.js';

export class PollService {
  constructor(
    private readonly polls: PollRepository,
    private readonly votes: PollVoteRepository,
    private readonly attendance: Pick<AttendanceService, 'requireParticipant'>,
    private readonly generator: McqGenerator,
    private readonly clock: Clock,
  ) {}

  draftFromSlide(slide: Attachment): Promise<McqDraft[]> {
    return this.generator.fromSlide(slide);
  }

  /** Shared by polls and practice questions: trimmed question, 2–6 non-empty options, a correct index that exists. */
  static normalizeDraft(draft: McqDraft): McqDraft {
    const options = draft.options.map((o) => o.trim());
    if (!draft.question.trim()) throw new DomainError('INVALID_POLL', 'חסרה שאלה');
    if (options.length < 2 || options.length > 6 || options.some((o) => !o)) throw new DomainError('INVALID_POLL', 'לסקר צריכות להיות 2–6 תשובות לא ריקות');
    if (draft.correctIndex !== null && (draft.correctIndex < 0 || draft.correctIndex >= options.length)) {
      throw new DomainError('INVALID_POLL', 'התשובה הנכונה לא קיימת ברשימה');
    }
    return { question: draft.question.trim(), options, correctIndex: draft.correctIndex };
  }

  async create(session: Session, draft: McqDraft, source: PollSource): Promise<Poll> {
    const { question, options, correctIndex } = PollService.normalizeDraft(draft);
    return this.polls.create({
      sessionId: session.id,
      question,
      options,
      correctIndex,
      status: 'draft',
      source,
      results: null,
      createdAt: this.clock.now(),
    });
  }

  /** One open poll per session: opening a new one closes the previous one, so phones never show two. */
  async open(session: Session, pollId: string): Promise<Poll> {
    if (session.status !== 'active') throw new DomainError('SESSION_ENDED', 'השיעור כבר הסתיים');
    const poll = await this.get(pollId);
    if (poll.status !== 'draft') throw new DomainError('POLL_STATE', 'אפשר לפתוח רק סקר שעוד לא נפתח');
    const current = await this.polls.findOpenBySession(poll.sessionId);
    if (current) await this.close(current.id);
    return this.polls.update(pollId, { status: 'open', openedAt: this.clock.now() });
  }

  async vote(pollId: string, student: Participant, optionIndex: number): Promise<void> {
    const poll = await this.get(pollId);
    if (poll.status !== 'open') throw new DomainError('POLL_CLOSED', 'הסקר סגור');
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
      throw new DomainError('INVALID_OPTION', 'אין תשובה כזו');
    }
    await this.attendance.requireParticipant(poll.sessionId, student.studentNumber);
    if (await this.votes.exists(pollId, student.studentNumber)) throw new DomainError('ALREADY_VOTED', 'כבר הצבעת בסקר הזה');
    try {
      await this.votes.create({ pollId, studentId: student.id, studentNumber: student.studentNumber, optionIndex });
    } catch {
      throw new DomainError('ALREADY_VOTED', 'כבר הצבעת בסקר הזה');
    }
  }

  /** Idempotent: closing a closed poll returns its stored results. */
  async close(pollId: string): Promise<PollResults> {
    const poll = await this.get(pollId);
    if (poll.status === 'closed' && poll.results) return poll.results;
    const counts = poll.options.map(() => 0);
    for (const v of await this.votes.listByPoll(pollId)) if (v.optionIndex < counts.length) counts[v.optionIndex]++;
    const results: PollResults = { counts, total: counts.reduce((a, b) => a + b, 0), correctIndex: poll.correctIndex };
    await this.polls.update(pollId, { status: 'closed', closedAt: this.clock.now(), results });
    return results;
  }

  async get(pollId: string): Promise<Poll> {
    const poll = await this.polls.get(pollId);
    if (!poll) throw new NotFoundError('Poll');
    return poll;
  }
}
