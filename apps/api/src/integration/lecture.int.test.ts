import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness.js';

describe('Integration: lecture page access against real PocketBase', () => {
  let h: Harness;
  let s1: string;
  let attended: TestUser;
  let missed: TestUser; // in the course (attended s2), missed s1
  let outsider: TestUser;

  beforeAll(async () => {
    h = await createHarness();
    s1 = (await h.startSession()).id;
    const s2 = (await h.startSession()).id;
    [attended, missed, outsider] = [await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo())];
    await h.checkIn(s1, attended);
    await h.checkIn(s2, missed);
  });

  afterAll(async () => {
    await h?.cleanup();
  });

  const list = (u: TestUser, collection: string) => u.pb.collection(collection).getFullList({ filter: `session = "${s1}"` });

  it('questions and answers: every course participant reads them, outsiders do not; the author stays hidden', async () => {
    const post = (await h.call(attended, 'POST', `/sessions/${s1}/posts`, { text: 'למה Observer?', anonymous: true })).body;
    await h.call(h.lecturer, 'POST', `/posts/${post.id}/answer`, { text: 'כדי לא לעשות polling.' });

    const seen = await list(missed, 'feed_posts');
    expect(seen.map((p) => p.id)).toEqual([post.id]);
    expect(seen[0]).toMatchObject({ answer: 'כדי לא לעשות polling.', answered: true, display_name: '' });
    expect(seen[0].author).toBeUndefined();
    expect(seen[0].author_number).toBeUndefined();
    expect(await list(outsider, 'feed_posts')).toEqual([]);
  });

  it('polls: a student who missed the lecture sees closed polls with results, never open ones', async () => {
    const closed = (await h.call(h.lecturer, 'POST', `/sessions/${s1}/polls`, { question: 'Q1', options: ['a', 'b'], correctIndex: 1, open: true })).body;
    await h.call(attended, 'POST', `/polls/${closed.id}/votes`, { optionIndex: 1 });
    await h.call(h.lecturer, 'POST', `/polls/${closed.id}/close`);
    const open = (await h.call(h.lecturer, 'POST', `/sessions/${s1}/polls`, { question: 'Q2', options: ['a', 'b'], open: true })).body;

    const seen = await list(missed, 'polls');
    expect(seen.map((p) => p.id)).toEqual([closed.id]);
    expect(seen[0]).toMatchObject({ answer_index: 1, results: { counts: [0, 1], total: 1 } });
    expect((await list(attended, 'polls')).map((p) => p.id).sort()).toEqual([closed.id, open.id].sort());
    expect(await list(outsider, 'polls')).toEqual([]);
    await h.call(h.lecturer, 'POST', `/polls/${open.id}/close`);
  });

  it('practice: correct_index hidden until the student answers; answers are private', async () => {
    await h.call(h.lecturer, 'POST', `/sessions/${s1}/end`);
    const q = (await h.call(h.lecturer, 'POST', `/sessions/${s1}/practice`, { question: 'DIP?', options: ['ממשקים', 'ירושה'], correctIndex: 0 })).body;

    const [seen] = await list(missed, 'practice_questions');
    expect(seen.id).toBe(q.id);
    expect(seen.correct_index).toBeUndefined();
    expect(await list(outsider, 'practice_questions')).toEqual([]);

    expect((await h.call(missed, 'POST', `/practice/${q.id}/answers`, { optionIndex: 1 })).body).toEqual({ correct: false, correctIndex: 0 });
    const mine = await missed.pb.collection('practice_answers').getFullList({ filter: `question = "${q.id}"` });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ option_index: 1, correct: false, correct_index: 0 });
    expect(await attended.pb.collection('practice_answers').getFullList({ filter: `question = "${q.id}"` })).toEqual([]);
    await expect(missed.pb.collection('practice_answers').create({ question: q.id, student_number: '1', option_index: 0, answered_at: new Date().toISOString() })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('materials: participants download the protected file with a file token; outsiders see nothing', async () => {
    const form = new FormData();
    form.set('file', new File(['%PDF-1.4 slides'], 'slides.pdf', { type: 'application/pdf' }));
    const m = (await h.call(h.lecturer, 'POST', `/sessions/${s1}/materials`, form)).body;

    const [rec] = await list(missed, 'materials');
    expect(rec).toMatchObject({ id: m.id, kind: 'file', filename: 'slides.pdf' });
    const plain = await fetch(missed.pb.files.getURL(rec, rec.file));
    expect(plain.status).toBe(404);
    const withToken = await fetch(missed.pb.files.getURL(rec, rec.file, { token: await missed.pb.files.getToken() }));
    expect(await withToken.text()).toBe('%PDF-1.4 slides');
    expect(await list(outsider, 'materials')).toEqual([]);
  });

  it('feedback: single answers are unreadable through PocketBase, even by the lecturer and the author', async () => {
    // s1 was ended in the practice test above.
    expect((await h.call(attended, 'POST', `/sessions/${s1}/feedback`, { rating: 'unclear', comment: 'עוד דוגמאות' })).status).toBe(201);
    for (const u of [h.lecturer, attended, missed, outsider]) {
      await expect(u.pb.collection('lesson_feedback').getFullList()).rejects.toMatchObject({ status: 403 });
    }
    await expect(attended.pb.collection('lesson_feedback').create({ session: s1, rating: 'clear', student_number: '1', submitted_at: new Date().toISOString() })).rejects.toMatchObject({
      status: 403,
    });
    expect((await h.call(h.lecturer, 'GET', `/sessions/${s1}/feedback`)).body).toEqual({ responses: 1, visible: false, counts: null, comments: [] });
    expect((await h.call(missed, 'POST', `/sessions/${s1}/feedback`, { rating: 'clear' })).body.code).toBe('NOT_CHECKED_IN');
  });
});
