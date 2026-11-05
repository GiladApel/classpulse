import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { Session } from './attendance/types.js';
import { buildContainer } from './container.js';
import { FixedClock } from './infra/Clock.js';
import { CsvExporter } from './infra/export/CsvExporter.js';
import { InMemoryRepository } from './infra/InMemoryRepository.js';
import { InMemoryAttendanceRepository } from './infra/memory/InMemoryAttendanceRepository.js';
import { InMemoryCourseRepository } from './infra/memory/InMemoryCourseRepository.js';
import type { UserIdentity } from './infra/pb/pbClient.js';
import { CLASSROOM, north, T0 } from './test/fixtures.js';

const USERS: Record<string, UserIdentity> = {
  lect: { id: 'lect1', name: 'ד״ר לוי', email: 'l@x', role: 'lecturer', studentNumber: '' },
  dana: { id: 'u1', name: 'דנה כהן', email: 'd@x', role: 'student', studentNumber: '111111111' },
  avi: { id: 'u2', name: 'אבי', email: 'a@x', role: 'student', studentNumber: '222222222' },
  fresh: { id: 'u3', name: 'חדש', email: 'n@x', role: 'student', studentNumber: '' },
};

describe('HTTP: attendance end-to-end (in-memory adapters)', () => {
  let clock: FixedClock;
  let app: ReturnType<typeof createApp>;

  const call = async (who: keyof typeof USERS | null, method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { ...(who ? { Authorization: `Bearer ${who}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), res };
  };

  const startSession = async (geofenceMode = 'lenient') =>
    (await call('lect', 'POST', '/sessions', { courseId: 'c1', title: 'הרצאה 5', location: CLASSROOM, geofenceMode, geofenceRadiusM: 50 })).body;

  const qr = async (id: string) => (await call('lect', 'GET', `/sessions/${id}/qr`)).body.token as string;

  beforeEach(() => {
    clock = new FixedClock(T0);
    app = createApp(
      buildContainer({
        clock,
        attendanceRepo: new InMemoryAttendanceRepository(),
        sessionRepo: new InMemoryRepository<Session>(),
        courseRepo: new InMemoryCourseRepository([{ id: 'c1', code: 'I2SE', name: 'הנדסת תוכנה', lecturerId: 'lect1' }]),
        exporters: new Map([['csv', new CsvExporter()]]),
        resolveUser: async (t) => USERS[t] ?? null,
        qrWindowSec: 10,
      }),
    );
  });

  it('health is public, everything else needs auth', async () => {
    expect((await call(null, 'GET', '/health')).status).toBe(200);
    expect((await call(null, 'GET', '/config')).status).toBe(401);
  });

  it('students cannot start sessions', async () => {
    expect((await call('dana', 'POST', '/sessions', {})).status).toBe(403);
  });

  it('full flow: start → QR → check-in → duplicate → manual → remove → export', async () => {
    const session = await startSession();
    expect(session).not.toHaveProperty('qrSecret');

    const token = await qr(session.id);
    const first = await call('dana', 'POST', '/checkins', { token, deviceId: 'phone-1', location: north(CLASSROOM, 10) });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ alreadyCheckedIn: false, sessionTitle: 'הרצאה 5', record: { studentNumber: '111111111', distanceM: 10 } });

    const again = await call('dana', 'POST', '/checkins', { token, deviceId: 'phone-1' });
    expect(again.status).toBe(200);
    expect(again.body.alreadyCheckedIn).toBe(true);

    const borrowed = await call('avi', 'POST', '/checkins', { token, deviceId: 'phone-1' });
    expect(borrowed.status).toBe(422);
    expect(borrowed.body.code).toBe('DEVICE_IN_USE');

    const manual = await call('lect', 'POST', `/sessions/${session.id}/attendance`, { studentNumber: '222222222', studentName: 'אבי', note: 'ידני' });
    expect(manual.status).toBe(201);
    expect(manual.body.method).toBe('manual');

    const removed = await call('lect', 'DELETE', `/attendance/${first.body.record.id}?reason=test`);
    expect(removed.body).toMatchObject({ status: 'removed', note: 'test' });

    const csv = await call('lect', 'GET', `/sessions/${session.id}/export?format=csv`);
    expect(csv.status).toBe(200);
    expect(csv.res.headers.get('content-disposition')).toContain('.csv');
    expect(csv.body).toContain('111111111');
    expect(csv.body).toContain('הוסר');
  });

  it('rejects an expired token with 422 TOKEN_EXPIRED', async () => {
    const session = await startSession();
    const token = await qr(session.id);
    clock.advance(25_000);
    const res = await call('dana', 'POST', '/checkins', { token, deviceId: 'p' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('an already-present student reopening an expired link gets their record, not an error', async () => {
    const session = await startSession();
    const token = await qr(session.id);
    await call('dana', 'POST', '/checkins', { token, deviceId: 'p' });
    clock.advance(60_000);
    const res = await call('dana', 'POST', '/checkins', { token, deviceId: 'p' });
    expect(res.status).toBe(200);
    expect(res.body.alreadyCheckedIn).toBe(true);
  });

  it('rejects malformed tokens with 400', async () => {
    expect((await call('dana', 'POST', '/checkins', { token: 'junk', deviceId: 'p' })).status).toBe(400);
  });

  it('requires onboarding (student id) before check-in', async () => {
    const session = await startSession();
    const res = await call('fresh', 'POST', '/checkins', { token: await qr(session.id), deviceId: 'p' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ONBOARDING_REQUIRED');
  });

  it('strict geofence blocks far students', async () => {
    const session = await startSession('strict');
    const res = await call('dana', 'POST', '/checkins', { token: await qr(session.id), deviceId: 'p', location: north(CLASSROOM, 500) });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('GEO_OUTSIDE');
  });

  it('ended sessions stop issuing QR and reject check-ins', async () => {
    const session = await startSession();
    const token = await qr(session.id);
    await call('lect', 'POST', `/sessions/${session.id}/end`);
    expect((await call('lect', 'GET', `/sessions/${session.id}/qr`)).status).toBe(409);
    expect((await call('dana', 'POST', '/checkins', { token, deviceId: 'p' })).body.code).toBe('SESSION_ENDED');
  });

  it('unconfigured export format → 409 EXPORT_UNAVAILABLE', async () => {
    const session = await startSession();
    const res = await call('lect', 'GET', `/sessions/${session.id}/export?format=sheets`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EXPORT_UNAVAILABLE');
  });

  it('validates input', async () => {
    const res = await call('lect', 'POST', '/sessions', { courseId: 'c1', title: 'x', geofenceMode: 'bogus', geofenceRadiusM: 50 });
    expect(res.status).toBe(400);
  });
});
