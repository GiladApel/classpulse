import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { FixedClock } from './infra/Clock.js';
import { makeTestPorts, type USERS } from './test/testContainer.js';

describe('HTTP: headcount + challenges', () => {
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

  const upload = (who: keyof typeof USERS = 'lect', file: File = new File([new Uint8Array([1, 2, 3])], 'class.jpg', { type: 'image/jpeg' })) => {
    const form = new FormData();
    form.set('photo', file);
    return call(who, 'POST', `/sessions/${sessionId}/headcounts`, form);
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

  it('headcount upload: lecturer only, validates the file, returns count and mismatch', async () => {
    for (const s of ['dana', 'avi', 'rina'] as const) await checkIn(s);
    expect((await upload('dana')).status).toBe(403);
    expect((await call('lect', 'POST', `/sessions/${sessionId}/headcounts`, new FormData())).status).toBe(400);
    expect((await upload('lect', new File(['x'], 'a.txt', { type: 'text/plain' }))).status).toBe(400);

    const res = await upload();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ presentCount: 3, mismatch: false, detectionFailed: false, headcount: { peopleCount: 3 } });
    expect(res.body.headcount.boxes).toHaveLength(3);
  });

  it('visual ping over HTTP: launch, tap, early close, confirm', async () => {
    const dana = await checkIn('dana');
    await checkIn('avi');
    const hc = (await upload()).body.headcount;

    const launched = await call('lect', 'POST', `/sessions/${sessionId}/challenges`, { type: 'visual_ping', headcountId: hc.id });
    expect(launched.status).toBe(201);
    expect(launched.body).not.toHaveProperty('secret');

    expect((await call('dana', 'POST', `/challenges/${launched.body.id}/responses`, { tap: { x: 0.19, y: 0.55 } })).status).toBe(201);
    expect((await call('dana', 'POST', `/challenges/${launched.body.id}/responses`, { tap: { x: 0.19, y: 0.55 } })).body.code).toBe('ALREADY_ANSWERED');
    expect((await call('avi', 'POST', `/challenges/${launched.body.id}/responses`, { tap: { x: 7, y: 0.5 } })).status).toBe(400);
    expect((await call('rina', 'POST', `/challenges/${launched.body.id}/responses`, { tap: { x: 0.5, y: 0.5 } })).body.code).toBe('NOT_ELIGIBLE');

    expect((await call('dana', 'POST', `/challenges/${launched.body.id}/close`)).status).toBe(403);
    const closed = await call('lect', 'POST', `/challenges/${launched.body.id}/close`);
    expect(closed.body.verdicts).toEqual({ 111111111: 'ok', 222222222: 'no_response' });

    const avi = (await call('avi', 'POST', '/checkins', { token: (await call('lect', 'GET', `/sessions/${sessionId}/qr`)).body.token, deviceId: 'dev-avi' })).body.record;
    expect(avi.status).toBe('flagged');
    expect((await call('lect', 'POST', `/attendance/${avi.id}/confirm`)).body.status).toBe('present');
    expect(dana.status).toBe('present');
  });

  it('roll-call over HTTP: lecturer QR, student scans, wrong-type QR request is refused', async () => {
    await checkIn('dana');
    const ch = (await call('lect', 'POST', `/sessions/${sessionId}/challenges`, { type: 'rollcall' })).body;
    const { token } = (await call('lect', 'GET', `/challenges/${ch.id}/qr`)).body;
    expect((await call('dana', 'GET', `/challenges/${ch.id}/qr`)).status).toBe(403);
    expect((await call('dana', 'POST', `/challenges/${ch.id}/responses`, { token })).status).toBe(201);

    clock.advance(31_000);
    expect((await call('lect', 'GET', `/challenges/${ch.id}/qr`)).status).toBe(409);
  });
});
