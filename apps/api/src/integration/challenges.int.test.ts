import type { RecordModel } from 'pocketbase';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser, waitFor } from './harness.js';

// Mock detection: three people centred at x ≈ 0.19 / 0.50 / 0.81, y ≈ 0.55.
const SEAT = [{ x: 0.19, y: 0.55 }, { x: 0.5, y: 0.55 }];
const EMPTY = { x: 0.5, y: 0.1 };

describe('Integration: headcount + challenges against real PocketBase', () => {
  let h: Harness;
  let photo: Buffer;

  const upload = async (sessionId: string) => {
    const form = new FormData();
    form.set('photo', new File([new Uint8Array(photo)], 'class.jpg', { type: 'image/jpeg' }));
    const res = await h.call(h.lecturer, 'POST', `/sessions/${sessionId}/headcounts`, form);
    expect(res.status).toBe(201);
    return res.body;
  };

  const download = async (who: TestUser, rec: RecordModel, field: string) => {
    const token = await who.pb.files.getToken();
    const res = await fetch(who.pb.files.getURL(rec, rec[field], { token }));
    return res.status;
  };

  beforeAll(async () => {
    h = await createHarness();
    photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#88aacc' } }).jpeg().toBuffer();
  });

  afterAll(async () => {
    await h?.cleanup();
  });

  it('challenge visibility: only students checked in to THIS session (and not removed) see it — incl. realtime', async () => {
    const s1 = await h.startSession();
    const s2 = await h.startSession();
    const inS1 = await h.makeUser('student', h.studentNo());
    const onlyS2 = await h.makeUser('student', h.studentNo());
    const removed = await h.makeUser('student', h.studentNo());
    await h.checkIn(s1.id, inS1);
    await h.checkIn(s2.id, onlyS2); // checked in somewhere else — must NOT see s1's challenge
    const removedRec = await h.checkIn(s1.id, removed);
    await h.call(h.lecturer, 'DELETE', `/attendance/${removedRec.id}`);

    const seen: Record<string, boolean> = {};
    const subs = [inS1, onlyS2, removed].map((u, i) => {
      const key = ['inS1', 'onlyS2', 'removed'][i];
      return new Promise<void>((resolve) => {
        u.pb.collection('challenges').subscribe('*', () => {
          seen[key] = true;
          resolve();
        });
      });
    });
    await new Promise((r) => setTimeout(r, 600));

    const ch = (await h.call(h.lecturer, 'POST', `/sessions/${s1.id}/challenges`, { type: 'rollcall' })).body;
    await waitFor(subs[0], 5000);
    await new Promise((r) => setTimeout(r, 800)); // give wrong recipients a chance to (incorrectly) receive it

    expect(seen).toEqual({ inS1: true });
    expect((await inS1.pb.collection('challenges').getList(1, 10, { filter: `session = "${s1.id}"` })).items.map((c) => c.id)).toEqual([ch.id]);
    expect((await onlyS2.pb.collection('challenges').getList(1, 10, { filter: `session = "${s1.id}"` })).items).toHaveLength(0);
    expect((await removed.pb.collection('challenges').getList(1, 10, { filter: `session = "${s1.id}"` })).items).toHaveLength(0);
    const asStudent = await inS1.pb.collection('challenges').getOne(ch.id);
    expect(asStudent.secret).toBeUndefined();

    for (const u of [inS1, onlyS2, removed]) await u.pb.collection('challenges').unsubscribe();
    await h.call(h.lecturer, 'POST', `/challenges/${ch.id}/close`);
  });

  it('visual ping end-to-end with real image processing, protected files and verdicts persisted', async () => {
    const s = await h.startSession();
    const [a, b, c] = [await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo())];
    const [ra, , rc] = [await h.checkIn(s.id, a), await h.checkIn(s.id, b), await h.checkIn(s.id, c)];

    const result = await upload(s.id);
    expect(result).toMatchObject({ presentCount: 3, headcount: { peopleCount: 3 }, detectionFailed: false });

    // Headcount photos: lecturer only.
    const hcRec = await h.lecturer.pb.collection('headcounts').getOne(result.headcount.id);
    expect(await download(h.lecturer, hcRec, 'photo')).toBe(200);
    await expect(a.pb.collection('headcounts').getOne(result.headcount.id)).rejects.toMatchObject({ status: 404 });

    const ch = (await h.call(h.lecturer, 'POST', `/sessions/${s.id}/challenges`, { type: 'visual_ping', headcountId: result.headcount.id })).body;
    // The challenge carries a blurred copy that checked-in students can download.
    const chRec = await a.pb.collection('challenges').getOne(ch.id);
    expect(await download(a, chRec, 'image')).toBe(200);
    const blurredMeta = await sharp(Buffer.from(await (await fetch(a.pb.files.getURL(chRec, chRec.image, { token: await a.pb.files.getToken() }))).arrayBuffer())).metadata();
    expect(blurredMeta.format).toBe('jpeg');

    // Lecturer watches taps arrive in realtime.
    const firstTap = new Promise<RecordModel>((resolve) => {
      h.lecturer.pb.collection('challenge_responses').subscribe('*', (e) => resolve(e.record), { filter: `challenge = "${ch.id}"` });
    });
    await new Promise((r) => setTimeout(r, 600));
    expect((await h.call(a, 'POST', `/challenges/${ch.id}/responses`, { tap: SEAT[0] })).status).toBe(201);
    expect((await waitFor(firstTap))?.x).toBeCloseTo(SEAT[0].x);
    await h.lecturer.pb.collection('challenge_responses').unsubscribe();

    expect((await h.call(c, 'POST', `/challenges/${ch.id}/responses`, { tap: EMPTY })).status).toBe(201);
    expect((await h.call(c, 'POST', `/challenges/${ch.id}/responses`, { tap: SEAT[1] })).body.code).toBe('ALREADY_ANSWERED');

    const closed = await h.call(h.lecturer, 'POST', `/challenges/${ch.id}/close`);
    expect(Object.values(closed.body.verdicts).sort()).toEqual(['empty_seat', 'no_response', 'ok']);

    const rows = await h.admin.collection('challenge_responses').getFullList({ filter: `challenge = "${ch.id}"` });
    expect(rows).toHaveLength(3);
    // The non-responder must not look like a tap at (0,0).
    const silent = rows.find((r) => r.verdict === 'no_response')!;
    expect([silent.x, silent.y]).toEqual([-1, -1]);
    const status = async (id: string) => (await h.admin.collection('attendance_records').getOne(id)).status;
    expect(await status(ra.id)).toBe('present');
    expect(await status(rc.id)).toBe('flagged');

    // A student sees only their own response.
    expect((await c.pb.collection('challenge_responses').getFullList({ filter: `challenge = "${ch.id}"` })).map((r) => r.verdict)).toEqual(['empty_seat']);

    // Ending the session purges the clear photo, keeps the blurred one.
    await h.call(h.lecturer, 'POST', `/sessions/${s.id}/end`);
    const after = await h.admin.collection('headcounts').getOne(result.headcount.id);
    expect(after.photo).toBe('');
    expect(after.blurred_photo).not.toBe('');
  });

  it('expired challenges are closed by closeExpired() using the real repository query', async () => {
    const s = await h.startSession();
    const a = await h.makeUser('student', h.studentNo());
    const rec = await h.checkIn(s.id, a);
    const ch = (await h.call(h.lecturer, 'POST', `/sessions/${s.id}/challenges`, { type: 'rollcall' })).body;
    // Pretend the timer ran out.
    await h.admin.collection('challenges').update(ch.id, { expires_at: new Date(Date.now() - 1000).toISOString() });
    // A running dev API's own timer may win the race; either way the outcome must be the same.
    await h.container.challenges.closeExpired();
    expect((await h.admin.collection('challenges').getOne(ch.id)).status).toBe('closed');
    expect((await h.admin.collection('attendance_records').getOne(rec.id)).status).toBe('flagged');
  });
});
