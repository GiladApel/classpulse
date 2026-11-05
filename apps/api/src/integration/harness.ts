import { EventSource } from 'eventsource';
import PocketBase, { type RecordModel } from 'pocketbase';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { buildProductionContainer } from '../container.js';
import { createSuperuserClient } from '../infra/pb/pbClient.js';
import { CLASSROOM } from '../test/fixtures.js';

// PocketBase realtime needs a browser-style EventSource.
(globalThis as { EventSource?: unknown }).EventSource ??= EventSource;
try {
  process.loadEnvFile('../../.env');
} catch {
  // env from shell
}

export const cfg = { ...loadConfig(), ai: { provider: 'mock' as const, geminiModel: 'mock' } };
const PASSWORD = 'int-test-pass-123';

export interface TestUser {
  record: RecordModel;
  token: string;
  pb: PocketBase;
}

/** Real app + real PocketBase; everything it creates is deleted in cleanup(). */
export async function createHarness() {
  const run = Date.now().toString(36);
  const admin = await createSuperuserClient(cfg.pbUrl, cfg.pbSuperuserEmail, cfg.pbSuperuserPassword);
  const container = await buildProductionContainer(cfg);
  const app = createApp(container);
  const created: RecordModel[] = [];
  let seq = 0;

  const makeUser = async (role: 'lecturer' | 'student', studentId = ''): Promise<TestUser> => {
    const email = `int-${run}-${++seq}@classpulse.test`;
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

  const studentNo = () => `9${run.slice(-4).replace(/\D/g, '0').padStart(4, '0')}${String(++seq).padStart(4, '0')}`;

  const call = async (who: TestUser, method: string, path: string, body?: unknown) => {
    const isForm = body instanceof FormData;
    const res = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${who.token}`, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer(), headers: res.headers };
  };

  const lecturer = await makeUser('lecturer');
  const course = await admin.collection('courses').create({ code: `INT${run}`, name: 'Integration', lecturer: lecturer.record.id });

  const startSession = async (geofenceMode = 'lenient') => {
    const res = await call(lecturer, 'POST', '/sessions', { courseId: course.id, title: `int ${run}`, location: CLASSROOM, geofenceMode, geofenceRadiusM: 50 });
    if (res.status !== 201) throw new Error(`startSession ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { id: string };
  };

  const qr = async (sessionId: string) => (await call(lecturer, 'GET', `/sessions/${sessionId}/qr`)).body.token as string;

  const checkIn = async (sessionId: string, who: TestUser) => {
    const res = await call(who, 'POST', '/checkins', { token: await qr(sessionId), deviceId: `d-${who.record.id}` });
    if (res.status !== 201 && res.status !== 200) throw new Error(`checkIn ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.record as { id: string; status: string };
  };

  const cleanup = async () => {
    await admin.collection('courses').delete(course.id); // cascades sessions → records, headcounts, challenges
    for (const u of created) await admin.collection('users').delete(u.id).catch(() => {});
  };

  return { run, admin, app, container, lecturer, course, makeUser, studentNo, call, startSession, qr, checkIn, cleanup };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

export const waitFor = <T>(p: Promise<T>, ms = 5000) =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
