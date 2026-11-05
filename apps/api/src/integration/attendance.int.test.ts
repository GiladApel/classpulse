import { EventSource } from 'eventsource';
import PocketBase, { type RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { buildProductionContainer } from '../container.js';
import { createSuperuserClient } from '../infra/pb/pbClient.js';
import { CLASSROOM, north } from '../test/fixtures.js';

// PocketBase realtime needs a browser-style EventSource.
(globalThis as { EventSource?: unknown }).EventSource ??= EventSource;
try {
  process.loadEnvFile('../../.env');
} catch {
  // env from shell
}

const cfg = loadConfig();
const RUN = Date.now().toString(36);
const PASSWORD = 'int-test-pass-123';

interface TestUser {
  record: RecordModel;
  token: string;
  pb: PocketBase;
}

describe('Integration: attendance against real PocketBase', () => {
  let admin: PocketBase;
  let app: ReturnType<typeof createApp>;
  let course: RecordModel;
  let lecturer: TestUser;
  const created: RecordModel[] = [];
  let seq = 0;

  const makeUser = async (role: 'lecturer' | 'student', studentId = ''): Promise<TestUser> => {
    const email = `int-${RUN}-${++seq}@classpulse.test`;
    const record = await admin.collection('users').create({
      email,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      name: `${role} ${seq}`,
      role,
      student_id: studentId,
      verified: true,
    });
    created.push(record);
    const pb = new PocketBase(cfg.pbUrl);
    pb.autoCancellation(false);
    await pb.collection('users').authWithPassword(email, PASSWORD);
    return { record, token: pb.authStore.token, pb };
  };

  const studentNo = () => `9${RUN.slice(-4).replace(/\D/g, '0').padStart(4, '0')}${String(++seq).padStart(4, '0')}`;

  const call = async (who: TestUser, method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer(), headers: res.headers };
  };

  const startSession = async (geofenceMode = 'lenient') => {
    const res = await call(lecturer, 'POST', '/sessions', {
      courseId: course.id,
      title: `int ${RUN}`,
      location: CLASSROOM,
      geofenceMode,
      geofenceRadiusM: 50,
    });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };

  const qr = async (sessionId: string) => (await call(lecturer, 'GET', `/sessions/${sessionId}/qr`)).body.token as string;

  beforeAll(async () => {
    admin = await createSuperuserClient(cfg.pbUrl, cfg.pbSuperuserEmail, cfg.pbSuperuserPassword);
    app = createApp(await buildProductionContainer(cfg));
    lecturer = await makeUser('lecturer');
    course = await admin.collection('courses').create({ code: `INT${RUN}`, name: 'Integration', lecturer: lecturer.record.id });
  });

  afterAll(async () => {
    if (course) await admin.collection('courses').delete(course.id); // cascades sessions → records
    for (const u of created) await admin.collection('users').delete(u.id).catch(() => {});
  });

  describe('collection rules', () => {
    it('a student cannot promote themselves to lecturer', async () => {
      const s = await makeUser('student', studentNo());
      await expect(s.pb.collection('users').update(s.record.id, { role: 'lecturer' })).rejects.toMatchObject({ status: 404 });
    });

    it('a student sets their student ID once, then cannot change it', async () => {
      const s = await makeUser('student');
      await s.pb.collection('users').update(s.record.id, { student_id: studentNo() });
      await expect(s.pb.collection('users').update(s.record.id, { student_id: studentNo() })).rejects.toBeTruthy();
    });

    it('students cannot write attendance directly, and never see the QR secret', async () => {
      const s = await makeUser('student', studentNo());
      const session = await startSession();
      await expect(
        s.pb.collection('attendance_records').create({ session: session.id, student_number: '1', checked_in_at: new Date().toISOString(), method: 'qr', status: 'present' }),
      ).rejects.toMatchObject({ status: 403 });
      const seen = await s.pb.collection('sessions').getOne(session.id);
      expect(seen.qr_secret).toBeUndefined();
    });
  });

  it('check-in flow with realtime push to the lecturer', async () => {
    const session = await startSession();
    const dana = await makeUser('student', studentNo());
    const avi = await makeUser('student', studentNo());

    const pushed = new Promise<RecordModel>((resolve) => {
      lecturer.pb
        .collection('attendance_records')
        .subscribe('*', (e) => e.action === 'create' && resolve(e.record), { filter: `session = "${session.id}"` });
    });
    await new Promise((r) => setTimeout(r, 500)); // let the SSE subscription register

    const token = await qr(session.id);
    const first = await call(dana, 'POST', '/checkins', { token, deviceId: `d-${RUN}-1`, location: north(CLASSROOM, 15) });
    expect(first.status).toBe(201);
    expect(first.body.record).toMatchObject({ studentNumber: dana.record.student_id, distanceM: 15, geoFlag: false });

    const event = await Promise.race([pushed, new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
    expect(event?.id).toBe(first.body.record.id);
    await lecturer.pb.collection('attendance_records').unsubscribe('*');

    const again = await call(dana, 'POST', '/checkins', { token, deviceId: `d-${RUN}-1` });
    expect(again).toMatchObject({ status: 200, body: { alreadyCheckedIn: true } });

    const borrowed = await call(avi, 'POST', '/checkins', { token, deviceId: `d-${RUN}-1` });
    expect(borrowed).toMatchObject({ status: 422, body: { code: 'DEVICE_IN_USE' } });

    const far = await call(avi, 'POST', '/checkins', { token, deviceId: `d-${RUN}-2`, location: north(CLASSROOM, 400) });
    expect(far.body.record).toMatchObject({ geoFlag: true, distanceM: 400 });

    // List rule: each student sees only their own record; the lecturer sees both.
    const danaSees = await dana.pb.collection('attendance_records').getFullList({ filter: `session = "${session.id}"` });
    expect(danaSees.map((r) => r.student_number)).toEqual([dana.record.student_id]);
    const lecturerSees = await lecturer.pb.collection('attendance_records').getFullList({ filter: `session = "${session.id}"` });
    expect(lecturerSees).toHaveLength(2);
  });

  it('concurrent scans by the same student produce exactly one record (DB unique index)', async () => {
    const session = await startSession();
    const s = await makeUser('student', studentNo());
    const token = await qr(session.id);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call(s, 'POST', '/checkins', { token, deviceId: `d-${RUN}-c` })),
    );
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.record.id)).size).toBe(1);
    const rows = await admin.collection('attendance_records').getFullList({ filter: `session = "${session.id}"` });
    expect(rows).toHaveLength(1);
  });

  it('strict geofence blocks; manual approve, remove and xlsx export work', async () => {
    const session = await startSession('strict');
    const s = await makeUser('student', studentNo());
    const blocked = await call(s, 'POST', '/checkins', { token: await qr(session.id), deviceId: `d-${RUN}-s`, location: north(CLASSROOM, 500) });
    expect(blocked).toMatchObject({ status: 422, body: { code: 'GEO_OUTSIDE' } });

    const manual = await call(lecturer, 'POST', `/sessions/${session.id}/attendance`, { studentNumber: s.record.student_id, studentName: 'ידני', note: 'GPS' });
    expect(manual).toMatchObject({ status: 201, body: { method: 'manual', status: 'present' } });

    const removed = await call(lecturer, 'DELETE', `/attendance/${manual.body.id}?reason=test`);
    expect(removed.body.status).toBe('removed');

    const xlsx = await call(lecturer, 'GET', `/sessions/${session.id}/export?format=xlsx`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get('content-type')).toContain('spreadsheetml');
    expect((xlsx.body as ArrayBuffer).byteLength).toBeGreaterThan(1000);
  });

  it('another lecturer cannot read the QR or export', async () => {
    const session = await startSession();
    const other = await makeUser('lecturer');
    expect((await call(other, 'GET', `/sessions/${session.id}/qr`)).status).toBe(403);
    expect((await call(other, 'GET', `/sessions/${session.id}/export?format=csv`)).status).toBe(403);
  });
});
