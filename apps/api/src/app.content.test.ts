import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { Container } from './container.js';
import type { FixedClock } from './infra/Clock.js';
import { minimalPdf } from './test/fixtures.js';
import { makeTestPorts, USERS } from './test/testContainer.js';

describe('HTTP: recordings + homework', () => {
  let app: ReturnType<typeof createApp>;
  let container: Container;
  let clock: FixedClock;
  let sessionId: string;

  const request = async (who: keyof typeof USERS, method: string, path: string, body?: BodyInit | object, type?: string) => {
    const raw = body instanceof FormData || body instanceof Uint8Array;
    const res = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${who}`, ...(type ? { 'Content-Type': type } : raw ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const checkIn = async (who: keyof typeof USERS) => {
    const { token } = (await request('lect', 'GET', `/sessions/${sessionId}/qr`)).body;
    await request(who, 'POST', '/checkins', { token, deviceId: `dev-${who}` });
  };

  const publish = (who: keyof typeof USERS, fields: Record<string, string>, file: File | null = new File(['%PDF-1.4 hw'], 'hw.pdf', { type: 'application/pdf' })) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    if (file) form.set('file', file);
    return request(who, 'POST', '/courses/c1/assignments', form);
  };

  const check = (who: keyof typeof USERS, assignmentId: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return request(who, 'POST', `/assignments/${assignmentId}/checks`, form);
  };
  const pdf = (text: string) => new File([new Uint8Array(minimalPdf(text))], 'sol.pdf', { type: 'application/pdf' });
  const jpg = (name = 'p.jpg') => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });

  beforeEach(async () => {
    const t = makeTestPorts();
    container = t.container;
    clock = t.clock;
    app = createApp(container);
    sessionId = (await request('lect', 'POST', '/sessions', { courseId: 'c1', title: 'L', geofenceMode: 'lenient', geofenceRadiusM: 50 })).body.id;
  });

  it('recording: chunked upload, background summary, timeline with a spike, publish', async () => {
    for (const s of ['dana', 'avi', 'rina'] as const) await checkIn(s);
    const bytes = new TextEncoder().encode('fake video bytes!!');
    const start = await request('lect', 'POST', `/sessions/${sessionId}/recordings`, { filename: 'lecture.mp4', mimeType: 'video/mp4', sizeBytes: bytes.length, offsetSec: 0 });
    expect(start.status).toBe(201);
    expect(start.body).toMatchObject({ status: 'uploading', chunkBytes: 50 * 1024 * 1024 });
    const id = start.body.id;
    expect((await request('dana', 'PUT', `/recordings/${id}/data?offset=0`, bytes.slice(0, 10), 'application/octet-stream')).status).toBe(403);

    expect((await request('lect', 'PUT', `/recordings/${id}/data?offset=0`, bytes.slice(0, 10), 'application/octet-stream')).body).toEqual({ received: 10 });
    expect((await request('lect', 'PUT', `/recordings/${id}/data?offset=-1`, bytes.slice(10), 'application/octet-stream')).status).toBe(400);
    expect((await request('lect', 'PUT', `/recordings/${id}/data?offset=10`, bytes.slice(10), 'application/octet-stream')).body).toEqual({ received: bytes.length });
    expect((await request('lect', 'POST', `/recordings/${id}/complete`)).status).toBe(202);
    await container.queue.idle();

    // Two of three students lost in minute 5 → spike in the "Strategy" chapter.
    clock.advance(5 * 60_000 + 10_000);
    await request('dana', 'POST', `/sessions/${sessionId}/lost`);
    await request('avi', 'POST', `/sessions/${sessionId}/lost`);
    clock.advance(60_000);
    const timeline = (await request('lect', 'GET', `/recordings/${id}/timeline`)).body;
    expect(timeline.spikes).toEqual([{ t: 300, count: 2, chapter: 'Strategy' }]);

    expect((await request('lect', 'POST', `/recordings/${id}/publish`, { published: true })).body).toMatchObject({ status: 'done', published: true });
  });

  it('homework: the lecturer publishes a PDF in a lesson; members check up to 3 times; reports are private, names only for the lecturer', async () => {
    expect((await publish('dana', { title: 'x' })).status).toBe(403);
    expect((await publish('lect', { title: 'x' }, null)).status).toBe(400);
    expect((await publish('lect', { title: 'x' }, new File(['x'], 'hw.docx', { type: 'application/msword' }))).status).toBe(400);
    expect((await publish('lect', { title: 'x', sessionId: 'nope' })).status).toBe(404);
    const created = await publish('lect', { title: 'תרגיל 2', sessionId, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(created).toMatchObject({ status: 201, body: { title: 'תרגיל 2', sessionId, guideStatus: 'generating', outline: null } });
    const aId = created.body.id;

    // Membership: dana and avi attended; rina never did.
    await checkIn('dana');
    await checkIn('avi');
    await container.queue.idle();
    expect((await check('rina', aId, [pdf('x')])).body.code).toBe('NOT_IN_COURSE');
    expect((await check('dana', aId, [])).status).toBe(400);
    expect((await check('dana', aId, [new File(['x'], 'a.txt', { type: 'text/plain' })])).status).toBe(400);
    expect((await check('dana', aId, [pdf('x'), jpg()])).status).toBe(400);
    expect((await check('dana', aId, Array.from({ length: 11 }, (_, i) => jpg(`${i}.jpg`)))).status).toBe(400);

    const text = 'Strategy lets the algorithm change at runtime, unlike a long if/else chain in the client code';
    const dana = await check('dana', aId, [pdf(text)]);
    expect(dana).toMatchObject({ status: 202, body: { status: 'processing', checkCount: 0 } });
    await check('avi', aId, [pdf(text)]); // Avi copies Dana's work.
    await container.queue.idle();

    const own = await request('dana', 'GET', `/submissions/${dana.body.id}`);
    expect(own.body).toMatchObject({ submission: { status: 'done', checkCount: 1, total: 36 }, checksLeft: 2, checked: 2, place: null });
    expect(own.body.outline.questions).toHaveLength(2);
    expect(JSON.stringify(own.body)).not.toContain('Context מחזיק'); // expected answers never leave the API
    expect((await request('avi', 'GET', `/submissions/${dana.body.id}`)).status).toBe(403);
    expect((await request('lect', 'GET', `/submissions/${dana.body.id}`)).status).toBe(200);

    expect((await request('dana', 'GET', `/assignments/${aId}/chart`)).body).toEqual({ visible: false, checked: 2, rows: [] });
    expect((await request('rina', 'GET', `/assignments/${aId}/chart`)).body.code).toBe('NOT_IN_COURSE');
    const lecturerChart = (await request('lect', 'GET', `/assignments/${aId}/chart`)).body;
    expect(lecturerChart.rows.map((r: { studentName: string }) => r.studentName).sort()).toEqual([USERS.avi.name, USERS.dana.name].sort());

    expect((await request('dana', 'POST', `/assignments/${aId}/insights`)).status).toBe(403);
    const insights = (await request('lect', 'POST', `/assignments/${aId}/insights`)).body;
    expect(insights.submissionCount).toBe(2);
    expect([insights.similarPairs[0].a.studentName, insights.similarPairs[0].b.studentName].sort()).toEqual([USERS.avi.name, USERS.dana.name].sort());
    const after = JSON.stringify((await request('dana', 'GET', `/submissions/${dana.body.id}`)).body);
    expect(after).not.toContain(USERS.avi.name);
    expect(after).not.toMatch(/similar/i);

    for (let i = 0; i < 2; i++) {
      await check('dana', aId, [jpg()]);
      await container.queue.idle();
    }
    expect((await check('dana', aId, [jpg()])).body.code).toBe('NO_CHECKS_LEFT');

    expect((await request('lect', 'POST', `/assignments/${aId}/guide/retry`)).body.code).toBe('GUIDE_NOT_FAILED');
    expect((await request('dana', 'DELETE', `/assignments/${aId}`)).status).toBe(403);
    expect((await request('lect', 'DELETE', `/assignments/${aId}`)).body).toEqual({ ok: true });
    expect((await request('dana', 'GET', `/submissions/${dana.body.id}`)).status).toBe(404);
  });
});
