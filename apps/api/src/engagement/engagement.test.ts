import { beforeEach, describe, expect, it } from 'vitest';
import { FeedClusterer } from '../ai/FeedClusterer.js';
import { LECTURE_QUESTIONS, McqGenerator } from '../ai/McqGenerator.js';
import { MockProvider } from '../ai/MockProvider.js';
import { FixedClock } from '../infra/Clock.js';
import {
  InMemoryFeedPostRepository,
  InMemoryLostSignalRepository,
  InMemoryPollRepository,
  InMemoryPollVoteRepository,
  InMemoryPostVoteRepository,
} from '../infra/memory/InMemoryEngagementRepositories.js';
import { DomainError } from '../shared/errors.js';
import { makeSession, T0 } from '../test/fixtures.js';
import { ConfusionMeter } from './ConfusionMeter.js';
import { FeedService } from './FeedService.js';
import { PollService } from './PollService.js';
import type { Participant } from './types.js';

const dana: Participant = { id: 'u1', studentNumber: '111', name: 'דנה' };
const avi: Participant = { id: 'u2', studentNumber: '222', name: 'אבי' };
const outsider: Participant = { id: 'u9', studentNumber: '999', name: 'זר' };

/** Dana and Avi are checked in; anyone else is not. */
const attendance = {
  present: new Set(['111', '222']),
  async requireParticipant(_sessionId: string, studentNumber: string) {
    if (!this.present.has(studentNumber)) throw new DomainError('NOT_CHECKED_IN', 'not checked in');
    return {} as never;
  },
  async presentCount() {
    return this.present.size;
  },
};

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);

describe('ConfusionMeter', () => {
  let clock: FixedClock;
  let meter: ConfusionMeter;
  const session = makeSession();

  beforeEach(() => {
    clock = new FixedClock(T0);
    meter = new ConfusionMeter(new InMemoryLostSignalRepository(), attendance, clock, 60);
  });

  it('accepts one signal per student per cooldown and reports the wait', async () => {
    expect(await meter.record(session, dana)).toEqual({ accepted: true, retryInSec: 60 });
    clock.advance(20_000);
    expect(await meter.record(session, dana)).toEqual({ accepted: false, retryInSec: 40 });
    clock.advance(40_000);
    expect((await meter.record(session, dana)).accepted).toBe(true);
  });

  it('level counts distinct students in the rolling window, relative to present', async () => {
    await meter.record(session, dana);
    clock.advance(61_000);
    await meter.record(session, dana);
    await meter.record(session, avi);
    expect(await meter.level(session.id, 120)).toEqual({ lost: 2, present: 2, ratio: 1, windowSec: 120 });
    clock.advance(130_000); // every signal is now older than 120 s
    expect(await meter.level(session.id, 120)).toMatchObject({ lost: 0, ratio: 0 });
  });

  it('rejects non-participants and ended sessions', async () => {
    expect(await code(meter.record(session, outsider))).toBe('NOT_CHECKED_IN');
    expect(await code(meter.record(makeSession({ status: 'ended' }), dana))).toBe('SESSION_ENDED');
  });
});

describe('FeedService', () => {
  let posts: InMemoryFeedPostRepository;
  let feed: FeedService;
  let llm: MockProvider;
  const session = makeSession();

  beforeEach(() => {
    posts = new InMemoryFeedPostRepository();
    llm = new MockProvider({ cluster_feed: { themes: [] } });
    feed = new FeedService(posts, new InMemoryPostVoteRepository(), attendance, new FeedClusterer(llm), new FixedClock(T0));
  });

  it('anonymous posts keep the author for the API but hide the name', async () => {
    const p = await feed.post(session, dana, 'לא הבנתי את ה-Factory', true);
    expect(p).toMatchObject({ displayName: null, anonymous: true, authorNumber: '111', votes: 0, answered: false });
    expect((await feed.post(session, avi, 'שאלה', false)).displayName).toBe('אבי');
    expect(await code(feed.post(session, outsider, 'x', false))).toBe('NOT_CHECKED_IN');
  });

  it('one upvote per participant; concurrent duplicates count once', async () => {
    const p = await feed.post(session, dana, 'q', false);
    await Promise.allSettled([feed.upvote(p.id, avi), feed.upvote(p.id, avi), feed.upvote(p.id, dana)]);
    expect((await feed.get(p.id)).votes).toBe(2);
    expect(await code(feed.upvote(p.id, avi))).toBe('ALREADY_VOTED');
    expect(await code(feed.upvote(p.id, outsider))).toBe('NOT_CHECKED_IN');
  });

  it('a written answer marks the post answered; clearing the text keeps the flag', async () => {
    const p = await feed.post(session, dana, 'מה ההבדל בין Strategy ל-State?', true);
    expect(await feed.answer(p.id, '  Strategy בוחר אלגוריתם; State משנה התנהגות לפי מצב.  ')).toMatchObject({
      answer: 'Strategy בוחר אלגוריתם; State משנה התנהגות לפי מצב.',
      answered: true,
    });
    expect(await feed.answer(p.id, ' ')).toMatchObject({ answer: '', answered: true });
    expect(await code(feed.answer('ghost', 'x'))).toBe('NOT_FOUND');
  });

  it('clusters only open posts and skips the model for fewer than two', async () => {
    const a = await feed.post(session, dana, 'a', false);
    expect(await feed.clusterOpen(session.id)).toEqual([{ title: 'a', summary: '', postIds: [a.id] }]);
    expect(llm.calls).toHaveLength(0);

    const b = await feed.post(session, avi, 'b', false);
    const c = await feed.post(session, avi, 'c', false);
    await feed.markAnswered(c.id, true);
    llm = new MockProvider({ cluster_feed: { themes: [{ title: 'T', summary: 's', postIds: [a.id, b.id, c.id, 'ghost'] }] } });
    feed = new FeedService(posts, new InMemoryPostVoteRepository(), attendance, new FeedClusterer(llm), new FixedClock(T0));
    expect(await feed.clusterOpen(session.id)).toEqual([{ title: 'T', summary: 's', postIds: [a.id, b.id] }]);
    expect(llm.calls[0].prompt).not.toContain(`${c.id}:`);
  });
});

describe('PollService', () => {
  let polls: PollService;
  const session = makeSession();

  beforeEach(() => {
    polls = new PollService(new InMemoryPollRepository(), new InMemoryPollVoteRepository(), attendance, new McqGenerator(new MockProvider()), new FixedClock(T0));
  });

  it('create → open → vote → close with tallies and reveal', async () => {
    const draft = await polls.create(session, { question: 'מה נכון?', options: ['א', 'ב', 'ג'], correctIndex: 1 }, 'manual');
    expect(draft.status).toBe('draft');
    expect(await code(polls.vote(draft.id, dana, 0))).toBe('POLL_CLOSED');

    await polls.open(session, draft.id);
    await polls.vote(draft.id, dana, 1);
    await polls.vote(draft.id, avi, 2);
    expect(await code(polls.vote(draft.id, dana, 2))).toBe('ALREADY_VOTED');
    expect(await code(polls.vote(draft.id, outsider, 0))).toBe('NOT_CHECKED_IN');
    expect(await code(polls.vote(draft.id, avi, 3))).toBe('INVALID_OPTION');

    const results = await polls.close(draft.id);
    expect(results).toEqual({ counts: [0, 1, 1], total: 2, correctIndex: 1 });
    expect(await polls.close(draft.id)).toEqual(results);
    expect(await code(polls.vote(draft.id, dana, 0))).toBe('POLL_CLOSED');
  });

  it('opening a poll closes the one already open', async () => {
    const a = await polls.create(session, { question: 'ברור?', options: ['כן', 'לא'], correctIndex: null }, 'ai');
    const b = await polls.create(session, { question: 'כמה ברור?', options: ['1', '2', '3'], correctIndex: null }, 'ai');
    await polls.open(session, a.id);
    await polls.open(session, b.id);
    expect((await polls.get(a.id)).status).toBe('closed');
    expect((await polls.get(b.id)).status).toBe('open');
    expect(await code(polls.open(session, a.id))).toBe('POLL_STATE');
    const c = await polls.create(session, { question: 'איזה?', options: ['A', 'B'], correctIndex: 0 }, 'ai');
    expect(await code(polls.open(makeSession({ status: 'ended' }), c.id))).toBe('SESSION_ENDED');
  });

  it('validates drafts', async () => {
    expect(await code(polls.create(session, { question: ' ', options: ['a', 'b'], correctIndex: null }, 'manual'))).toBe('INVALID_POLL');
    expect(await code(polls.create(session, { question: 'q', options: ['a'], correctIndex: null }, 'manual'))).toBe('INVALID_POLL');
    expect(await code(polls.create(session, { question: 'q', options: ['a', ''], correctIndex: null }, 'manual'))).toBe('INVALID_POLL');
    expect(await code(polls.create(session, { question: 'q', options: ['a', 'b'], correctIndex: 2 }, 'manual'))).toBe('INVALID_POLL');
  });
});

describe('McqGenerator', () => {
  it('returns up to 3 valid drafts and drops malformed ones', async () => {
    const llm = new MockProvider({
      generate_mcq: {
        questions: [
          { question: 'ok', options: ['a', 'b', 'c', 'd'], correctIndex: 3 },
          { question: 'bad index', options: ['a', 'b'], correctIndex: 5 },
          { question: '', options: ['a', 'b'], correctIndex: 0 },
          null,
          { question: 'ok2', options: ['a', 'b'], correctIndex: 0 },
        ],
      },
    });
    const drafts = await new McqGenerator(llm).fromSlide({ mimeType: 'image/png', data: Buffer.from([1]) });
    expect(drafts).toEqual([
      { question: 'ok', options: ['a', 'b', 'c', 'd'], correctIndex: 3 },
      { question: 'ok2', options: ['a', 'b'], correctIndex: 0 },
    ]);
    expect(llm.calls[0].files).toHaveLength(1);
  });

  it('throws when nothing usable comes back', async () => {
    const llm = new MockProvider({ generate_mcq: { questions: [{ question: 'x', options: [], correctIndex: 0 }] } });
    await expect(new McqGenerator(llm).fromSlide({ mimeType: 'image/png', data: Buffer.from([1]) })).rejects.toThrow('no valid questions');
  });

  it('drafts up to 8 practice questions from a whole deck', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ question: `q${i}`, options: ['a', 'b'], correctIndex: 0 }));
    const llm = new MockProvider({ generate_practice: { questions: many } });
    const deck = { mimeType: 'application/pdf', data: Buffer.from('%PDF') };
    expect(await new McqGenerator(llm).fromLecture(deck)).toHaveLength(LECTURE_QUESTIONS);
    expect(llm.calls[0]).toMatchObject({ task: 'generate_practice', files: [deck] });
    expect(llm.calls[0].prompt).toContain(`exactly ${LECTURE_QUESTIONS}`);
  });
});
