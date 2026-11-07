import type { Attachment } from '../ai/LLMProvider.js';
import type { PracticeQuestionGenerator } from '../ai/PracticeQuestionGenerator.js';
import type { Session } from '../attendance/types.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import type { PracticeQuestionRepository } from './repositories.js';
import type { PracticeQuestion } from './types.js';

/** Open review questions on a lecture page (FR-LP-02): the lecturer publishes them, course participants read them. */
export class PracticeService {
  constructor(
    private readonly questions: PracticeQuestionRepository,
    private readonly generator: Pick<PracticeQuestionGenerator, 'fromLecture'>,
    private readonly clock: Clock,
  ) {}

  /** AI drafts from the lecture's slide deck; nothing is saved until the lecturer adds the ones they want. */
  draftFromLecture(deck: Attachment): Promise<string[]> {
    return this.generator.fromLecture(deck);
  }

  async add(session: Session, question: string, source: PracticeQuestion['source']): Promise<PracticeQuestion> {
    const text = question.trim();
    if (!text) throw new DomainError('INVALID_QUESTION', 'חסרה שאלה');
    return this.questions.create({ sessionId: session.id, question: text, source, createdAt: this.clock.now() });
  }

  async remove(questionId: string): Promise<void> {
    await this.get(questionId);
    await this.questions.delete(questionId);
  }

  async get(questionId: string): Promise<PracticeQuestion> {
    const q = await this.questions.get(questionId);
    if (!q) throw new NotFoundError('Question');
    return q;
  }
}
