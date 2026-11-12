import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { makeTestPorts, USERS } from './test/testContainer.js';

describe('HTTP: admin, courses and the Zoom link', () => {
  let app: ReturnType<typeof createApp>;

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
    app = createApp(makeTestPorts().container);
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

  it('a lecturer creates a course once per code; students cannot', async () => {
    const created = await call('lect', 'POST', '/courses', { code: 'OOP', name: 'תכנות מונחה עצמים' });
    expect(created).toMatchObject({ status: 201, body: { code: 'OOP', name: 'תכנות מונחה עצמים' } });
    expect((await call('lect', 'POST', '/courses', { code: 'OOP', name: 'x' })).body.code).toBe('COURSE_EXISTS');
    expect((await call('dana', 'POST', '/courses', { code: 'X', name: 'x' })).status).toBe(403);
    const s = await call('lect', 'POST', '/sessions', { courseId: created.body.id, title: 'L1', geofenceMode: 'lenient', geofenceRadiusM: 50 });
    expect(s.status).toBe(201);
  });

  it('zoom link: lecturer only; students join without location even in strict mode; it stops at the end', async () => {
    const id = await start();
    expect((await call('dana', 'GET', `/sessions/${id}/zoom-link`)).status).toBe(403);
    const { token } = (await call('lect', 'GET', `/sessions/${id}/zoom-link`)).body;

    const joined = await call('dana', 'POST', '/zoom-checkins', { token });
    expect(joined).toMatchObject({ status: 201, body: { alreadyCheckedIn: false, sessionTitle: 'L', record: { method: 'zoom', status: 'present' } } });
    expect((await call('dana', 'POST', '/zoom-checkins', { token })).body.alreadyCheckedIn).toBe(true);
    expect((await call('avi', 'POST', '/zoom-checkins', { token: token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A') })).body.code).toBe('TOKEN_INVALID');
    expect((await call('fresh', 'POST', '/zoom-checkins', { token })).body.code).toBe('ONBOARDING_REQUIRED');

    // A Zoom student takes part online.
    expect((await call('dana', 'POST', `/sessions/${id}/posts`, { text: 'שאלה מזום', anonymous: false })).status).toBe(201);

    await call('lect', 'POST', `/sessions/${id}/end`);
    expect((await call('avi', 'POST', '/zoom-checkins', { token })).body.code).toBe('SESSION_ENDED');
    expect((await call('lect', 'GET', `/sessions/${id}/zoom-link`)).body.code).toBe('SESSION_ENDED');
  });

  it('challenges and the headcount count only the students in the room', async () => {
    const id = (await call('lect', 'POST', '/sessions', { courseId: 'c1', title: 'L', geofenceMode: 'lenient', geofenceRadiusM: 50 })).body.id;
    const { token: qr } = (await call('lect', 'GET', `/sessions/${id}/qr`)).body;
    await call('dana', 'POST', '/checkins', { token: qr, deviceId: 'dev-d' });
    const { token } = (await call('lect', 'GET', `/sessions/${id}/zoom-link`)).body;
    await call('avi', 'POST', '/zoom-checkins', { token });

    const form = new FormData();
    form.set('photo', new File([new Uint8Array([1])], 'c.jpg', { type: 'image/jpeg' }));
    const hc = await app.request(`/sessions/${id}/headcounts`, { method: 'POST', headers: { Authorization: 'Bearer lect' }, body: form });
    expect(await hc.json()).toMatchObject({ presentCount: 1 });

    const ch = (await call('lect', 'POST', `/sessions/${id}/challenges`, { type: 'rollcall' })).body;
    const { token: rc } = (await call('lect', 'GET', `/challenges/${ch.id}/qr`)).body;
    expect((await call('avi', 'POST', `/challenges/${ch.id}/responses`, { token: rc })).body.code).toBe('NOT_ELIGIBLE');
    expect((await call('lect', 'POST', `/challenges/${ch.id}/close`)).body.verdicts).toEqual({ 111111111: 'no_response' });
  });
});
