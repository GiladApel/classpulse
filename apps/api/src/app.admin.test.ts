import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { makeTestPorts, USERS } from './test/testContainer.js';

describe('HTTP: admin', () => {
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

});
