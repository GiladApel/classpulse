import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { minimalPdf } from '../test/fixtures.js';
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

  it('homework: the rubric and notes are hidden from everyone, the PDF is for members; a hand-in is kept for the student and the lecturer, its grade API-only', async () => {
    const publish = new FormData();
    publish.set('title', 'HW');
    publish.set('sessionId', s1);
    publish.set('notes', 'grade the diagram strictly');
    publish.set('file', new File([new Uint8Array(minimalPdf('Homework 2: explain Strategy'))], 'hw.pdf', { type: 'application/pdf' }));
    const a = (await h.call(h.lecturer, 'POST', `/courses/${h.course.id}/assignments`, publish)).body;
    expect(a).toMatchObject({ guideStatus: 'generating', sessionId: s1 });
    await h.container.queue.idle();

    const seen = await attendedS2Only.pb.collection('assignments').getOne(a.id);
    expect(seen).toMatchObject({ guide_status: 'ready', session: s1 });
    for (const u of [attendedS2Only, h.lecturer]) {
      const r = await u.pb.collection('assignments').getOne(a.id);
      expect([r.guide, r.outline, r.rubric_notes]).toEqual([undefined, undefined, undefined]);
    }
    const full = await h.admin.collection('assignments').getOne(a.id);
    expect([full.guide.questions.length, full.rubric_notes]).toEqual([2, 'grade the diagram strictly']);
    expect(await outsider.pb.collection('assignments').getFullList({ filter: `course = "${h.course.id}"` })).toEqual([]);
    // The homework PDF is protected: members download it with a file token.
    const token = await attendedS2Only.pb.files.getToken();
    expect((await fetch(attendedS2Only.pb.files.getURL(seen, seen.file, { token }))).status).toBe(200);
    expect((await fetch(attendedS2Only.pb.files.getURL(seen, seen.file))).status).toBe(404);

    const send = async (u: TestUser, route: 'checks' | 'handin', text: string) => {
      const form = new FormData();
      form.append('files', new File([new Uint8Array(minimalPdf(text))], 'sol.pdf', { type: 'application/pdf' }));
      return h.call(u, 'POST', `/assignments/${a.id}/${route}`, form);
    };
    expect((await send(outsider, 'checks', 'an outsider trying to check a solution')).body.code).toBe('NOT_IN_COURSE');
    const text = 'Strategy lets the algorithm change at runtime instead of a long if else chain';
    const mine = (await send(attendedS1, 'checks', text)).body;
    await h.container.queue.idle();
    const practice = await attendedS1.pb.collection('submissions').getOne(mine.id);
    expect(practice).toMatchObject({ status: 'done', check_count: 1, files: [] }); // a practice file is never stored
    expect(practice.report.marks.length).toBe(3);

    await send(attendedS1, 'handin', text);
    const theirs = (await send(attendedS2Only, 'handin', text)).body;
    await h.container.queue.idle();

    const own = await attendedS1.pb.collection('submissions').getOne(mine.id);
    expect(own).toMatchObject({ final_status: 'done', files: [expect.stringMatching(/^sol.*\.pdf$/)] });
    expect([own.final_report, own.final_total, own.fingerprint]).toEqual([undefined, undefined, undefined]);
    const lecturerRow = await h.lecturer.pb.collection('submissions').getOne(mine.id);
    expect([lecturerRow.final_report, lecturerRow.final_total]).toEqual([undefined, undefined]); // the grade leaves only through the API
    expect((await h.admin.collection('submissions').getOne(mine.id)).final_total).toBe(36);
    // The handed-in file: the student and the lecturer download it with a file token; a classmate cannot see the row.
    const fileUrl = async (u: TestUser) => u.pb.files.getURL(own, own.files[0], { token: await u.pb.files.getToken() });
    expect((await fetch(await fileUrl(attendedS1))).status).toBe(200);
    expect((await fetch(await fileUrl(h.lecturer))).status).toBe(200);
    expect((await fetch(await fileUrl(attendedS2Only))).status).toBe(404);
    await expect(attendedS1.pb.collection('submissions').getOne(theirs.id)).rejects.toMatchObject({ status: 404 });
    await expect(attendedS1.pb.collection('submissions').update(mine.id, { total: 100 })).rejects.toMatchObject({ status: 403 });
    await expect(attendedS1.pb.collection('assignments').create({ course: h.course.id, title: 'x', guide_status: 'ready', created_at: new Date().toISOString() })).rejects.toMatchObject({ status: 403 });

    const insights = (await h.call(h.lecturer, 'POST', `/assignments/${a.id}/insights`)).body;
    expect(insights.similarPairs).toHaveLength(1);
    const asStudent = await attendedS1.pb.collection('assignment_insights').getFirstListItem(`assignment = "${a.id}"`);
    expect(asStudent.common_mistakes).toBeDefined();
    expect(asStudent.similar_pairs).toBeUndefined();
    const asLecturer = await h.lecturer.pb.collection('assignment_insights').getFirstListItem(`assignment = "${a.id}"`);
    expect(asLecturer.similar_pairs).toBeUndefined(); // the lecturer reads pairs only through the API, with names attached

    // Restart recovery finds an interrupted grading through the real status query.
    await h.admin.collection('submissions').update(theirs.id, { final_status: 'processing' });
    expect(await h.container.homework.recoverInterrupted()).toBeGreaterThanOrEqual(1);
    expect((await h.admin.collection('submissions').getOne(theirs.id)).final_status).toBe('failed');

    // Deleting the homework removes its rows and insights.
    expect((await h.call(h.lecturer, 'DELETE', `/assignments/${a.id}`)).body).toEqual({ ok: true });
    await expect(h.admin.collection('submissions').getOne(mine.id)).rejects.toMatchObject({ status: 404 });
  });

  it('restart recovery marks unfinished jobs failed using the real status queries', async () => {
    const rec = (await h.call(h.lecturer, 'POST', `/sessions/${s1}/recordings`, { filename: 'l.mp4', mimeType: 'video/mp4', sizeBytes: 10 })).body;
    expect(await h.container.recordings.recoverInterrupted()).toBeGreaterThanOrEqual(1);
    expect((await h.admin.collection('recordings').getOne(rec.id)).status).toBe('failed');
  });
});
