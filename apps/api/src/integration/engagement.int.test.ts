import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser, waitFor } from './harness.js';

describe('Integration: backchannel + polls against real PocketBase', () => {
  let h: Harness;
  let sessionId: string;
  let a: TestUser;
  let b: TestUser;
  let outsider: TestUser;

  const ids = (list: RecordModel[]) => list.map((r) => r.id);

  beforeAll(async () => {
    h = await createHarness();
    sessionId = (await h.startSession()).id;
    [a, b, outsider] = [await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo())];
    await h.checkIn(sessionId, a);
    await h.checkIn(sessionId, b);
  });

  afterAll(async () => {
    await h?.cleanup();
  });

  it('feed: anonymous author is unrecoverable from PocketBase; only participants read the feed; students cannot write directly', async () => {
    const post = (await h.call(a, 'POST', `/sessions/${sessionId}/posts`, { text: 'שאלה אנונימית', anonymous: true })).body;
    const asPeer = await b.pb.collection('feed_posts').getOne(post.id);
    const asLecturer = await h.lecturer.pb.collection('feed_posts').getOne(post.id);
    for (const rec of [asPeer, asLecturer]) {
      expect(rec.author).toBeUndefined();
      expect(rec.author_number).toBeUndefined();
      expect(rec.display_name).toBe('');
    }
    expect((await h.admin.collection('feed_posts').getOne(post.id)).author).toBe(a.record.id);

    expect(ids(await outsider.pb.collection('feed_posts').getFullList({ filter: `session = "${sessionId}"` }))).toEqual([]);
    await expect(a.pb.collection('feed_posts').create({ session: sessionId, text: 'direct', posted_at: new Date().toISOString() })).rejects.toMatchObject({ status: 403 });
    await expect(a.pb.collection('feed_posts').update(post.id, { votes: 999 })).rejects.toMatchObject({ status: 403 });
  });

  it('upvotes are not lost under concurrency (PB votes+ alone is not atomic)', async () => {
    const post = (await h.call(a, 'POST', `/sessions/${sessionId}/posts`, { text: 'popular' })).body;
    const voters = [a, b, ...(await Promise.all([0, 1, 2, 3].map(() => h.makeUser('student', h.studentNo()))))];
    for (const v of voters.slice(2)) await h.checkIn(sessionId, v);
    // Every voter fires twice at once: 6 voters → exactly 6 votes.
    const results = await Promise.all(voters.flatMap((v) => [h.call(v, 'POST', `/posts/${post.id}/votes`), h.call(v, 'POST', `/posts/${post.id}/votes`)]));
    expect(results.filter((r) => r.status === 201)).toHaveLength(6);
    expect((await h.admin.collection('feed_posts').getOne(post.id)).votes).toBe(6);
    expect(await h.admin.collection('post_votes').getFullList({ filter: `post = "${post.id}"` })).toHaveLength(6);
  });

  it('lost signals: lecturer sees them in realtime without identity, students cannot read them', async () => {
    const got = new Promise<RecordModel>((resolve) => {
      h.lecturer.pb.collection('lost_signals').subscribe('*', (e) => resolve(e.record), { filter: `session = "${sessionId}"` });
    });
    await new Promise((r) => setTimeout(r, 600));
    expect((await h.call(b, 'POST', `/sessions/${sessionId}/lost`)).body.accepted).toBe(true);
    const event = await waitFor(got);
    expect(event?.session).toBe(sessionId);
    // Lecturer learns how many are lost, never who.
    expect(event?.student).toBeUndefined();
    expect(event?.student_number).toBeUndefined();
    await h.lecturer.pb.collection('lost_signals').unsubscribe();

    expect(await b.pb.collection('lost_signals').getFullList({ filter: `session = "${sessionId}"` })).toEqual([]);
    expect((await h.call(h.lecturer, 'GET', `/sessions/${sessionId}/confusion`)).body).toMatchObject({ lost: 1 });
  });

  it('polls: drafts hidden from students, answer hidden until close, realtime open event, own votes only', async () => {
    const poll = (await h.call(h.lecturer, 'POST', `/sessions/${sessionId}/polls`, { question: 'מה נכון?', options: ['א', 'ב', 'ג'], correctIndex: 2 })).body;
    await expect(a.pb.collection('polls').getOne(poll.id)).rejects.toMatchObject({ status: 404 });

    const opened = new Promise<RecordModel>((resolve) => {
      a.pb.collection('polls').subscribe('*', (e) => {
        if (e.record.status === 'open') resolve(e.record);
      });
    });
    await new Promise((r) => setTimeout(r, 600));
    await h.call(h.lecturer, 'POST', `/polls/${poll.id}/open`);
    const seen = await waitFor(opened);
    expect(seen?.id).toBe(poll.id);
    expect(seen?.correct_index).toBeUndefined();
    expect(seen?.answer_index).toBe(-1);
    await a.pb.collection('polls').unsubscribe();

    await expect(outsider.pb.collection('polls').getOne(poll.id)).rejects.toMatchObject({ status: 404 });
    expect((await h.call(outsider, 'POST', `/polls/${poll.id}/votes`, { optionIndex: 0 })).body.code).toBe('NOT_CHECKED_IN');

    await h.call(a, 'POST', `/polls/${poll.id}/votes`, { optionIndex: 2 });
    await h.call(b, 'POST', `/polls/${poll.id}/votes`, { optionIndex: 0 });
    expect((await a.pb.collection('poll_votes').getFullList({ filter: `poll = "${poll.id}"` })).map((v) => v.option_index)).toEqual([2]);
    expect(await h.lecturer.pb.collection('poll_votes').getFullList({ filter: `poll = "${poll.id}"` })).toHaveLength(2);

    expect((await h.call(h.lecturer, 'POST', `/polls/${poll.id}/close`)).body).toEqual({ counts: [1, 0, 1], total: 2, correctIndex: 2 });
    const closed = await a.pb.collection('polls').getOne(poll.id);
    expect(closed).toMatchObject({ status: 'closed', answer_index: 2, results: { counts: [1, 0, 1], total: 2, correctIndex: 2 } });
    expect(closed.correct_index).toBeUndefined();
  });

  it('template poll without a correct answer reveals -1, and a new poll closes the open one', async () => {
    const p1 = (await h.call(h.lecturer, 'POST', `/sessions/${sessionId}/polls`, { template: 'yes_no', question: 'ברור?', open: true })).body;
    const p2 = (await h.call(h.lecturer, 'POST', `/sessions/${sessionId}/polls`, { template: 'scale5', question: 'כמה?', open: true })).body;
    expect((await h.admin.collection('polls').getOne(p1.id)).status).toBe('closed');
    expect((await h.admin.collection('polls').getOne(p2.id)).status).toBe('open');
    const r = (await h.call(h.lecturer, 'POST', `/polls/${p1.id}/close`)).body;
    expect(r).toEqual({ counts: [0, 0], total: 0, correctIndex: null });
    expect((await h.admin.collection('polls').getOne(p1.id)).answer_index).toBe(-1);
  });
});
