import type { SessionRepository } from '../attendance/repositories.js';
import type { Session } from '../attendance/types.js';
import type { FeedbackService } from '../engagement/FeedbackService.js';
import type { FeedPostRepository, PollRepository } from '../engagement/repositories.js';
import type { ClassSignals } from './types.js';

/** Everything a lesson measured about its class except the "I'm lost" spikes, which need the recording's clock. */
export class LessonSignals {
  constructor(
    private readonly sessions: Pick<SessionRepository, 'get' | 'listByCourse'>,
    private readonly posts: Pick<FeedPostRepository, 'listBySession'>,
    private readonly polls: Pick<PollRepository, 'listBySession'>,
    private readonly feedback: Pick<FeedbackService, 'summary'>,
  ) {}

  async session(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId);
  }

  lessonsOf(courseId: string): Promise<Session[]> {
    return this.sessions.listByCourse(courseId);
  }

  async of(sessionId: string): Promise<Omit<ClassSignals, 'lostSpikes'>> {
    const [posts, polls, feedback] = await Promise.all([this.posts.listBySession(sessionId), this.polls.listBySession(sessionId), this.feedback.summary(sessionId)]);
    return {
      unansweredQuestions: posts
        .filter((p) => !p.answered)
        .sort((a, b) => b.votes - a.votes)
        .slice(0, 8)
        .map((p) => ({ text: p.text, upvotes: p.votes })),
      polls: polls
        .filter((p) => p.status === 'closed' && p.results)
        .map((p) => ({
          question: p.question,
          answered: p.results!.total,
          correctPercent: p.correctIndex !== null && p.results!.total > 0 ? Math.round((100 * (p.results!.counts[p.correctIndex] ?? 0)) / p.results!.total) : null,
        })),
      feedback: { responses: feedback.responses, counts: feedback.counts },
    };
  }
}
