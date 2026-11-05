// Fixture and realtime side of the NFR-02 load test (docs/08-testing.md §4). k6 (loadtest/checkin.js) does the HTTP load.
//   prepare <baseUrl> [n=80]  creates a lecturer, n students, a course and an active session; writes loadtest/.fixture.json
//   listen                    n students subscribe to attendance_records (SSE) and wait for their own check-in event
//   cleanup                   deletes the course (sessions and records cascade) and every load-test account
// baseUrl is the public origin, e.g. https://classpulse.giladautomation.com (API at /api, PocketBase at /pb).
// Superuser credentials come from PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD. Superuser calls are refused through Cloudflare
// (deploy/nginx.conf), so against production set PB_ADMIN_URL to an SSH tunnel, e.g. http://127.0.0.1:18092/pb.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { EventSource } from 'eventsource';
import PocketBase from 'pocketbase';
import { createSuperuserClient } from '../src/infra/pb/pbClient.js';

(globalThis as { EventSource?: unknown }).EventSource = EventSource;

const FIXTURE = '../../loadtest/.fixture.json';
const DOMAIN = 'loadtest.classpulse.local';
const LOCATION = { lat: 32.1033, lng: 35.2079 }; // Ariel University

interface Fixture {
  baseUrl: string;
  sessionId: string;
  courseId: string;
  lecturerToken: string;
  location: typeof LOCATION;
  students: { id: string; token: string; deviceId: string }[];
}

const superuser = (baseUrl: string) =>
  createSuperuserClient(process.env.PB_ADMIN_URL ?? `${baseUrl}/pb`, process.env.PB_SUPERUSER_EMAIL ?? '', process.env.PB_SUPERUSER_PASSWORD ?? '');

async function prepare(baseUrl: string, n: number) {
  const pb = await superuser(baseUrl);
  const password = randomBytes(18).toString('hex');
  const account = async (email: string, data: Record<string, unknown>) => {
    const existing = await pb.collection('users').getFirstListItem(pb.filter('email = {:e}', { e: email })).catch(() => null);
    const body = { ...data, password, passwordConfirm: password, verified: true };
    return existing ? pb.collection('users').update(existing.id, body) : pb.collection('users').create({ email, ...body });
  };
  const login = async (email: string) => {
    const client = new PocketBase(`${baseUrl}/pb`);
    return (await client.collection('users').authWithPassword(email, password)).token;
  };

  const lecturer = await account(`lecturer@${DOMAIN}`, { name: 'Load Lecturer', role: 'lecturer' });
  const course = await pb.collection('courses').create({ code: 'LOAD', name: 'Load test', lecturer: lecturer.id });
  const lecturerToken = await login(`lecturer@${DOMAIN}`);

  const students: Fixture['students'] = [];
  for (let i = 0; i < n; i++) {
    const email = `s${String(i).padStart(3, '0')}@${DOMAIN}`;
    const s = await account(email, { name: `סטודנט ${i}`, role: 'student', student_id: String(900000000 + i) });
    students.push({ id: s.id, token: await login(email), deviceId: `load-device-${i}` });
  }

  const res = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${lecturerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: course.id, title: 'Load test', location: LOCATION, geofenceMode: 'lenient', geofenceRadiusM: 100 }),
  });
  if (!res.ok) throw new Error(`start session: ${res.status} ${await res.text()}`);
  const session = (await res.json()) as { id: string };

  const fixture: Fixture = { baseUrl, sessionId: session.id, courseId: course.id, lecturerToken, location: LOCATION, students };
  writeFileSync(FIXTURE, JSON.stringify(fixture));
  console.log(`Prepared ${n} students, session ${session.id}`);
}

async function listen(timeoutSec: number) {
  const f = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
  const latencies: number[] = [];
  const clients: PocketBase[] = [];
  let done!: () => void;
  const all = new Promise<void>((r) => (done = r));

  await Promise.all(
    f.students.map(async (s) => {
      const pb = new PocketBase(`${f.baseUrl}/pb`);
      pb.autoCancellation(false);
      pb.authStore.save(s.token);
      clients.push(pb);
      let seen = false;
      await pb.collection('attendance_records').subscribe('*', (e) => {
        if (seen || e.action !== 'create' || e.record.session !== f.sessionId) return;
        seen = true;
        latencies.push(Date.now() - new Date(e.record.checked_in_at.replace(' ', 'T')).getTime());
        if (latencies.length === f.students.length) done();
      });
    }),
  );
  console.log(`${clients.length} subscribers connected; waiting up to ${timeoutSec}s for check-ins`);
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutSec * 1000))]);
  latencies.sort((a, b) => a - b);
  const p = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
  console.log(`realtime events: ${latencies.length}/${f.students.length}` + (latencies.length ? `, delay p50 ${p(0.5)} ms, p95 ${p(0.95)} ms, max ${latencies.at(-1)} ms` : ''));
  for (const pb of clients) pb.realtime.unsubscribe();
  process.exit(latencies.length === f.students.length ? 0 : 1);
}

async function cleanup() {
  const f = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
  const pb = await superuser(f.baseUrl);
  await pb.collection('courses').delete(f.courseId).catch(() => {});
  const users = await pb.collection('users').getFullList({ filter: pb.filter('email ~ {:d}', { d: `@${DOMAIN}` }) });
  for (const u of users) await pb.collection('users').delete(u.id);
  console.log(`Deleted the load-test course and ${users.length} accounts`);
}

const [cmd, arg1, arg2] = process.argv.slice(2);
if (cmd === 'prepare' && arg1) await prepare(arg1.replace(/\/$/, ''), Number(arg2 ?? 80));
else if (cmd === 'listen') await listen(Number(arg1 ?? 90));
else if (cmd === 'cleanup') await cleanup();
else {
  console.error('Usage: loadtest prepare <baseUrl> [n] | listen [timeoutSec] | cleanup');
  process.exit(1);
}
