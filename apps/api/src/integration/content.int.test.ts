import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness.js';

describe('Integration: recordings + homework against real PocketBase', () => {
  let h: Harness;
  let s1: string;
  let s2: string;
  let attendedS1: TestUser;
  let attendedS2Only: TestUser;
  let outsider: TestUser;

  const ids = (list: { id: string }[]) => list.map((r) => r.id).sort();

  beforeAll(async () => {
    h = await createHarness();
    s1 = (await h.startSession()).id;
    s2 = (await h.startSession()).id;
    [attendedS1, attendedS2Only, outsider] = [await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo())];
    await h.checkIn(s1, attendedS1);
    await h.checkIn(s2, attendedS2Only);
  });

  afterAll(async () => {
    await h?.cleanup();
  });

  it('recording summary: lecturer only until published, then every course participant (even one who missed that lecture)', async () => {
    const transcript = new TextEncoder().encode('00:00 שלום\n05:00 Strategy\n20:00 State');
    const rec = (await h.call(h.lecturer, 'POST', `/sessions/${s1}/recordings`, { filename: 'l.vtt', mimeType: 'text/vtt', sizeBytes: transcript.length })).body;
    const put = await h.app.request(`/recordings/${rec.id}/data?offset=0`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${h.lecturer.token}`, 'Content-Type': 'application/octet-stream' },
      body: transcript,
    });
    expect(await put.json()).toEqual({ received: transcript.length });
    await h.call(h.lecturer, 'POST', `/recordings/${rec.id}/complete`);
    await h.container.queue.idle();

    const stored = await h.lecturer.pb.collection('recordings').getOne(rec.id);
    expect(stored.status).toBe('done');
    expect(stored.summary.chapters.length).toBeGreaterThan(0);
    for (const u of [attendedS1, attendedS2Only, outsider]) await expect(u.pb.collection('recordings').getOne(rec.id)).rejects.toMatchObject({ status: 404 });

    await h.call(h.lecturer, 'POST', `/recordings/${rec.id}/publish`, { published: true });
    expect((await attendedS1.pb.collection('recordings').getOne(rec.id)).summary.tldr).toBeTruthy();
    expect((await attendedS2Only.pb.collection('recordings').getOne(rec.id)).id).toBe(rec.id);
    await expect(outsider.pb.collection('recordings').getOne(rec.id)).rejects.toMatchObject({ status: 404 });
    await expect(attendedS1.pb.collection('recordings').update(rec.id, { published: false })).rejects.toMatchObject({ status: 403 });
  });

  it('homework: hidden analysis fields, own submissions only, similar pairs never readable through PocketBase', async () => {
    const a = (await h.call(h.lecturer, 'POST', `/courses/${h.course.id}/assignments`, { title: 'HW', description: 'd', rubric: [{ criterion: 'נכונות', weight: 1 }] })).body;
    expect(ids(await attendedS1.pb.collection('assignments').getFullList({ filter: `course = "${h.course.id}"` }))).toEqual([a.id]);
    expect(await outsider.pb.collection('assignments').getFullList({ filter: `course = "${h.course.id}"` })).toEqual([]);

    const submit = async (u: TestUser, text: string) => {
      const form = new FormData();
      form.set('file', new File([text], 'hw.py', { type: 'text/x-python' }));
      return h.call(u, 'POST', `/assignments/${a.id}/submissions`, form);
    };
    expect((await submit(outsider, 'print("an outsider trying to submit")')).body.code).toBe('NOT_IN_COURSE');
    const mine = (await submit(attendedS1, 'def solve(): return sorted(data, key=len)')).body;
    const theirs = (await submit(attendedS2Only, 'def solve(): return sorted(data, key=len)')).body;
    await h.container.queue.idle();

    const own = await attendedS1.pb.collection('submissions').getOne(mine.id);
    expect(own).toMatchObject({ status: 'done' });
    expect(own.text_extract).toBeUndefined();
    expect(own.fingerprint).toBeUndefined();
    await expect(attendedS1.pb.collection('submissions').getOne(theirs.id)).rejects.toMatchObject({ status: 404 });
    // The original file is protected but downloadable by its owner.
    const token = await attendedS1.pb.files.getToken();
    expect((await fetch(attendedS1.pb.files.getURL(own, own.file, { token }))).status).toBe(200);
    expect((await h.admin.collection('submissions').getOne(mine.id)).fingerprint.length).toBeGreaterThan(0);

    const insights = (await h.call(h.lecturer, 'POST', `/assignments/${a.id}/insights`)).body;
    expect(insights.similarPairs).toHaveLength(1);
    const asStudent = await attendedS1.pb.collection('assignment_insights').getFirstListItem(`assignment = "${a.id}"`);
    expect(asStudent.common_mistakes).toBeDefined();
    expect(asStudent.similar_pairs).toBeUndefined();
    const asLecturer = await h.lecturer.pb.collection('assignment_insights').getFirstListItem(`assignment = "${a.id}"`);
    expect(asLecturer.similar_pairs).toBeUndefined(); // the lecturer reads pairs only through the API, with names attached
  });

  it('restart recovery marks unfinished jobs failed using the real status queries', async () => {
    const rec = (await h.call(h.lecturer, 'POST', `/sessions/${s1}/recordings`, { filename: 'l.mp4', mimeType: 'video/mp4', sizeBytes: 10 })).body;
    expect(await h.container.recordings.recoverInterrupted()).toBeGreaterThanOrEqual(1);
    expect((await h.admin.collection('recordings').getOne(rec.id)).status).toBe('failed');
  });
});
