import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../infra/Clock.js';
import { InMemoryLessonFeedbackRepository } from '../infra/memory/InMemoryEngagementRepositories.js';
import { DomainError } from '../shared/errors.js';
import { makeSession, T0 } from '../test/fixtures.js';
import { FEEDBACK_WINDOW_MS, FeedbackService, MIN_FEEDBACK_RESPONSES } from './FeedbackService.js';
import type { Participant } from './types.js';

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);
const student = (n: number): Participant => ({ id: `u${n}`, studentNumber: `${n}${n}${n}`, name: `s${n}` });

/** Students 1–5 were checked in; 9 was not. */
const attendance = {
  async requireParticipant(_sessionId: string, studentNumber: string) {
    if (!['111', '222', '333', '444', '555'].includes(studentNumber)) throw new DomainError('NOT_CHECKED_IN', 'not checked in');
    return {} as never;
  },
};

describe('FeedbackService', () => {
  let clock: FixedClock;
  let service: FeedbackService;
  const ended = makeSession({ status: 'ended', endedAt: T0 });

  beforeEach(() => {
    clock = new FixedClock(T0);
    service = new FeedbackService(new InMemoryLessonFeedbackRepository(), attendance, clock);
  });

  it('opens when the lecture ends, for those who were checked in, and closes after 24 h', async () => {
    expect(await code(service.submit(makeSession({ status: 'active' }), student(1), 'clear', ''))).toBe('FEEDBACK_NOT_OPEN');
    expect(await service.status(makeSession({ status: 'active' }), student(1))).toEqual({ open: false, submitted: false, closesAt: null });
    expect(await service.status(ended, student(1))).toEqual({ open: true, submitted: false, closesAt: new Date(T0.getTime() + FEEDBACK_WINDOW_MS) });
    expect((await service.status(ended, student(9))).open).toBe(false);
    expect(await code(service.submit(ended, student(9), 'clear', ''))).toBe('NOT_CHECKED_IN');

    clock.advance(FEEDBACK_WINDOW_MS);
    expect((await service.status(ended, student(1))).open).toBe(false);
    expect(await code(service.submit(ended, student(1), 'clear', ''))).toBe('FEEDBACK_CLOSED');
  });

  it('one answer per student; the comment is optional; concurrent duplicates count once', async () => {
    expect(await code(service.submit(ended, student(1), 'too_fast', ''))).toBe('ok');
    expect(await service.status(ended, student(1))).toMatchObject({ open: false, submitted: true });
    expect(await code(service.submit(ended, student(1), 'clear', 'again'))).toBe('ALREADY_SENT');
    const results = await Promise.allSettled([service.submit(ended, student(2), 'clear', ''), service.submit(ended, student(2), 'unclear', '')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await code(service.submit(ended, student(3), 'great' as never, ''))).toBe('INVALID_OPTION');
  });

  it(`hides everything but the count below ${MIN_FEEDBACK_RESPONSES} responses, then shows counts and comments without identity or time order`, async () => {
    await service.submit(ended, student(1), 'unclear', '  לא הבנתי את Observer  ');
    await service.submit(ended, student(2), 'too_fast', '');
    expect(await service.summary(ended.id)).toEqual({ responses: 2, visible: false, counts: null, comments: [] });

    await service.submit(ended, student(3), 'clear', 'מעולה');
    await service.submit(ended, student(4), 'unclear', 'אפשר עוד דוגמאות');
    const s = await service.summary(ended.id);
    expect(s).toEqual({
      responses: 4,
      visible: true,
      counts: { clear: 1, too_fast: 1, too_slow: 0, unclear: 2 },
      comments: [
        { rating: 'clear', text: 'מעולה' },
        { rating: 'unclear', text: 'אפשר עוד דוגמאות' },
        { rating: 'unclear', text: 'לא הבנתי את Observer' },
      ],
    });
    expect(JSON.stringify(s)).not.toMatch(/111|u1|s1|submittedAt/);
  });
});
