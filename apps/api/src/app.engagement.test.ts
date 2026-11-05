import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { FixedClock } from './infra/Clock.js';
import { makeTestPorts, type USERS } from './test/testContainer.js';

describe('HTTP: backchannel + polls', () => {
  let app: ReturnType<typeof createApp>;
  let clock: FixedClock;
  let sessionId: string;

  const call = async (who: keyof typeof USERS, method: string, path: string, body?: unknown) => {
    const isForm = body instanceof FormData;
    const res = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${who}`, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const checkIn = async (who: keyof typeof USERS) => {
    const { token } = (await call('lect', 'GET', `/sessions/${sessionId}/qr`)).body;
    return (await call(who, 'POST', '/checkins', { token, deviceId: `dev-${who}` })).body.record;
  };

  beforeEach(async () => {
    const t = makeTestPorts();
    clock = t.clock;
    app = createApp(t.container);
    sessionId = (await call('lect', 'POST', '/sessions', { courseId: 'c1', title: 'L', geofenceMode: 'lenient', geofenceRadiusM: 50 })).body.id;
  });

  it("I'm lost: checked-in students only, cooldown, lecturer-only level", async () => {
    await checkIn('dana');
    await checkIn('avi');
    expect((await call('rina', 'POST', `/sessions/${sessionId}/lost`)).body.code).toBe('NOT_CHECKED_IN');
    expect((await call('fresh', 'POST', `/sessions/${sessionId}/lost`)).body.code).toBe('ONBOARDING_REQUIRED');
    expect((await call('dana', 'POST', `/sessions/${sessionId}/lost`)).body).toEqual({ accepted: true, retryInSec: 60 });
    clock.advance(5000);
    expect((await call('dana', 'POST', `/sessions/${sessionId}/lost`)).body).toEqual({ accepted: false, retryInSec: 55 });

    expect((await call('dana', 'GET', `/sessions/${sessionId}/confusion`)).status).toBe(403);
    expect((await call('lect', 'GET', `/sessions/${sessionId}/confusion`)).body).toEqual({ lost: 1, present: 2, ratio: 0.5, windowSec: 120 });
  });

  it('feed: anonymous post hides the author, upvote once, lecturer marks answered', async () => {
    await checkIn('dana');
    await checkIn('avi');
    const post = await call('dana', 'POST', `/sessions/${sessionId}/posts`, { text: '  מה ההבדל בין Strategy ל-State? ', anonymous: true });
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ text: 'מה ההבדל בין Strategy ל-State?', displayName: null, anonymous: true });
    expect(JSON.stringify(post.body)).not.toMatch(/u1|111111111|דנה/);

    expect((await call('dana', 'POST', `/sessions/${sessionId}/posts`, { text: 'x'.repeat(501) })).status).toBe(400);
    expect((await call('dana', 'POST', `/sessions/${sessionId}/posts`, { text: 'x', anonymous: 'yes' })).status).toBe(400);

    expect((await call('avi', 'POST', `/posts/${post.body.id}/votes`)).status).toBe(201);
    expect((await call('avi', 'POST', `/posts/${post.body.id}/votes`)).body.code).toBe('ALREADY_VOTED');

    expect((await call('avi', 'POST', `/posts/${post.body.id}/answered`, { answered: true })).status).toBe(403);
    const answered = await call('lect', 'POST', `/posts/${post.body.id}/answered`, { answered: true });
    expect(answered.body).toMatchObject({ answered: true, votes: 1 });

    // After class the feed stays open (FR-BC-02).
    await call('lect', 'POST', `/sessions/${sessionId}/end`);
    expect((await call('avi', 'POST', `/sessions/${sessionId}/posts`, { text: 'שאלה אחרי השיעור' })).status).toBe(201);
    expect((await call('avi', 'POST', `/sessions/${sessionId}/lost`)).body.code).toBe('SESSION_ENDED');
  });

  it('poll from a slide: AI drafts → create (open) → vote → close reveals the answer', async () => {
    await checkIn('dana');
    await checkIn('avi');
    const form = new FormData();
    form.set('slide', new File([new Uint8Array([1, 2, 3])], 'slide.png', { type: 'image/png' }));
    expect((await call('dana', 'POST', '/polls/drafts', form)).status).toBe(403);
    expect((await call('lect', 'POST', '/polls/drafts', new FormData())).status).toBe(400);
    const { drafts } = (await call('lect', 'POST', '/polls/drafts', form)).body;
    expect(drafts).toHaveLength(3);

    const poll = await call('lect', 'POST', `/sessions/${sessionId}/polls`, { ...drafts[0], source: 'ai', open: true });
    expect(poll.status).toBe(201);
    expect(poll.body).toMatchObject({ status: 'open', source: 'ai', correctIndex: 0 });

    expect((await call('dana', 'POST', `/polls/${poll.body.id}/votes`, { optionIndex: 0 })).status).toBe(201);
    expect((await call('avi', 'POST', `/polls/${poll.body.id}/votes`, { optionIndex: 2 })).status).toBe(201);
    expect((await call('avi', 'POST', `/polls/${poll.body.id}/votes`, { optionIndex: 1 })).body.code).toBe('ALREADY_VOTED');
    expect((await call('rina', 'POST', `/polls/${poll.body.id}/votes`, { optionIndex: 1 })).body.code).toBe('NOT_CHECKED_IN');

    expect((await call('dana', 'POST', `/polls/${poll.body.id}/close`)).status).toBe(403);
    expect((await call('lect', 'POST', `/polls/${poll.body.id}/close`)).body).toEqual({ counts: [1, 0, 1, 0], total: 2, correctIndex: 0 });
  });

  it('template poll and validation', async () => {
    const yn = await call('lect', 'POST', `/sessions/${sessionId}/polls`, { template: 'yes_no', question: 'ברור?' });
    expect(yn.body).toMatchObject({ status: 'draft', source: 'template', options: ['כן', 'לא'], correctIndex: null });
    expect((await call('lect', 'POST', `/sessions/${sessionId}/polls`, { template: 'nope', question: 'q' })).status).toBe(400);
    expect((await call('lect', 'POST', `/sessions/${sessionId}/polls`, { question: 'q', options: 'a,b' })).status).toBe(400);
    expect((await call('lect', 'POST', `/sessions/${sessionId}/polls`, { question: 'q', options: ['a'] })).body.code).toBe('INVALID_POLL');
    expect((await call('dana', 'POST', `/sessions/${sessionId}/polls`, { template: 'yes_no', question: 'q' })).status).toBe(403);
    expect((await call('lect', 'POST', `/polls/${yn.body.id}/open`)).body.status).toBe('open');
  });
});
