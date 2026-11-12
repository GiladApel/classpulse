import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { makeTestPorts, USERS } from './test/testContainer.js';

describe('HTTP: admin, courses and remote attendance', () => {
  let app: ReturnType<typeof createApp>;
  let t: ReturnType<typeof makeTestPorts>;

  const call = async (who: keyof typeof USERS, method: string, path: string, body?: object) => {
    const res = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${who}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const start = async () => (await call('lect', 'POST', '/sessions', { courseId: 'c1', title: 'L', geofenceMode: 'strict', geofenceRadiusM: 50 })).body.id as string;

  beforeEach(() => {
    t = makeTestPorts();
    app = createApp(t.container);
  });

  it('only admins list users and change roles', async () => {
    expect((await call('boss', 'GET', '/me')).body).toEqual({ admin: true });
    expect((await call('lect', 'GET', '/me')).body).toEqual({ admin: false });
    expect((await call('lect', 'GET', '/admin/users')).status).toBe(403);
    expect((await call('dana', 'POST', '/admin/users/u2/role', { role: 'lecturer' })).status).toBe(403);

    const found = await call('boss', 'GET', '/admin/users?q=' + encodeURIComponent('דנה'));
    expect(found.body.users).toEqual([{ id: 'u1', name: 'דנה כהן', email: 'd@x', studentNumber: '111111111', role: 'student' }]);
    expect((await call('boss', 'POST', '/admin/users/u1/role', { role: 'lecturer' })).body).toMatchObject({ id: 'u1', role: 'lecturer' });
    expect((await call('boss', 'POST', '/admin/users/u1/role', { role: 'admin' })).status).toBe(400);
    expect((await call('boss', 'POST', '/admin/users/adm1/role', { role: 'student' })).body.code).toBe('OWN_ROLE');
  });

  it('challenges and the headcount count only the students in the room', async () => {
    const id = (await call('lect', 'POST', '/sessions', { courseId: 'c1', title: 'L', geofenceMode: 'lenient', geofenceRadiusM: 50 })).body.id;
    const { token: qr } = (await call('lect', 'GET', `/sessions/${id}/qr`)).body;
    await call('dana', 'POST', '/checkins', { token: qr, deviceId: 'dev-d' });
    await t.container.courses.enroll((await t.container.sessions.getCourse('c1'))!, '222222222', 'אבי');
    await call('avi', 'POST', `/sessions/${id}/join-remote`);

    const form = new FormData();
    form.set('photo', new File([new Uint8Array([1])], 'c.jpg', { type: 'image/jpeg' }));
    const hc = await app.request(`/sessions/${id}/headcounts`, { method: 'POST', headers: { Authorization: 'Bearer lect' }, body: form });
    expect(await hc.json()).toMatchObject({ presentCount: 1 });

    const ch = (await call('lect', 'POST', `/sessions/${id}/challenges`, { type: 'rollcall' })).body;
    const { token: rc } = (await call('lect', 'GET', `/challenges/${ch.id}/qr`)).body;
    expect((await call('avi', 'POST', `/challenges/${ch.id}/responses`, { token: rc })).body.code).toBe('NOT_ELIGIBLE');
    expect((await call('lect', 'POST', `/challenges/${ch.id}/close`)).body.verdicts).toEqual({ 111111111: 'no_response' });
  });

  it('join remotely: course members only, while the lesson is live; one record whichever way came first', async () => {
    const { container } = t;
    const id = await start();
    const course = (await container.sessions.getCourse('c1'))!;
    await container.courses.enroll(course, '111111111', 'דנה כהן');

    expect((await call('avi', 'POST', `/sessions/${id}/join-remote`)).body.code).toBe('NOT_IN_COURSE');
    expect((await call('fresh', 'POST', `/sessions/${id}/join-remote`)).body.code).toBe('ONBOARDING_REQUIRED');
    const joined = await call('dana', 'POST', `/sessions/${id}/join-remote`);
    expect(joined).toMatchObject({ status: 201, body: { alreadyCheckedIn: false, record: { method: 'zoom', status: 'present' } } });
    expect((await call('dana', 'POST', `/sessions/${id}/join-remote`)).status).toBe(200);
    expect((await call('dana', 'POST', `/sessions/${id}/posts`, { text: 'שאלה מרחוק', anonymous: false })).status).toBe(201);
    expect((await app.request(`/sessions/${id}/zoom-link`, { headers: { Authorization: 'Bearer lect' } })).status).toBe(404);
    expect((await call('dana', 'POST', '/sessions/nope/join-remote')).status).toBe(404);

    await call('lect', 'POST', `/sessions/${id}/end`);
    await container.courses.enroll(course, '444444444', 'רינה');
    expect((await call('rina', 'POST', `/sessions/${id}/join-remote`)).body.code).toBe('SESSION_ENDED');
  });
});
