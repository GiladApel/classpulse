import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { Container } from './container.js';
import type { FixedClock } from './infra/Clock.js';
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

  const upload = (who: keyof typeof USERS, assignmentId: string, text: string, filename = 'hw.py') => {
    const form = new FormData();
    form.set('file', new File([text], filename, { type: 'text/x-python' }));
    return request(who, 'POST', `/assignments/${assignmentId}/submissions`, form);
  };

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

  it('homework: participants only, review over HTTP, own submission only, pairs named for the lecturer only', async () => {
    const created = await request('lect', 'POST', '/courses/c1/assignments', {
      title: 'תרגיל 2',
      description: 'Strategy',
      rubric: [{ criterion: 'נכונות', weight: 3, description: '' }, { criterion: 'בדיקות', weight: 1 }],
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(created.status).toBe(201);
    expect(created.body.rubric.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2']);
    expect((await request('dana', 'POST', '/courses/c1/assignments', { title: 'x', rubric: [] })).status).toBe(403);
    expect((await request('lect', 'POST', '/courses/c1/assignments', { title: 'x', rubric: [{ criterion: 'a' }] })).status).toBe(400);
    const aId = created.body.id;

    expect((await upload('dana', aId, 'print("hello world from dana")')).body.code).toBe('NOT_IN_COURSE');
    await checkIn('dana');
    await checkIn('avi');
    const dana = await upload('dana', aId, 'def strategy(): return run_all_the_things(42)');
    expect(dana.status).toBe(202);
    expect(dana.body.status).toBe('processing');
    // Avi copies Dana's work.
    await upload('avi', aId, 'def strategy(): return run_all_the_things(42)');
    expect((await upload('avi', aId, 'x', 'hw.exe')).status).toBe(409);
    await container.queue.idle();

    const own = await request('dana', 'GET', `/submissions/${dana.body.id}`);
    expect(own.body.submission).toMatchObject({ status: 'done', studentName: USERS.dana.name });
    expect(own.body.percentiles).toBeNull(); // fewer than 5 reviewed submissions
    expect((await request('avi', 'GET', `/submissions/${dana.body.id}`)).status).toBe(403);
    expect((await request('lect', 'GET', `/submissions/${dana.body.id}`)).status).toBe(200);

    expect((await request('dana', 'POST', `/assignments/${aId}/insights`)).status).toBe(403);
    const insights = (await request('lect', 'POST', `/assignments/${aId}/insights`)).body;
    expect(insights.submissionCount).toBe(2);
    expect(insights.similarPairs).toHaveLength(1);
    expect([insights.similarPairs[0].a.studentName, insights.similarPairs[0].b.studentName].sort()).toEqual([USERS.avi.name, USERS.dana.name].sort());

    // The student view carries class-wide mistakes but nothing about pairs or other students.
    const after = JSON.stringify((await request('dana', 'GET', `/submissions/${dana.body.id}`)).body);
    expect(after).not.toContain(USERS.avi.name);
    expect(after).not.toMatch(/similar/i);
  });
});
