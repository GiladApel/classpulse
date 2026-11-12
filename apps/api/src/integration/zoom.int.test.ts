import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness.js';

describe('Integration: Zoom attendance and admin roles against real PocketBase', () => {
  let h: Harness;
  let s1: string;
  let inRoom: TestUser;
  let onZoom: TestUser;

  beforeAll(async () => {
    h = await createHarness();
    s1 = (await h.startSession()).id;
    [inRoom, onZoom] = [await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo())];
    await h.checkIn(s1, inRoom);
    const { token } = (await h.call(h.lecturer, 'GET', `/sessions/${s1}/zoom-link`)).body;
    expect((await h.call(onZoom, 'POST', '/zoom-checkins', { token })).status).toBe(201);
  });

  afterAll(async () => {
    await h?.cleanup();
  });

  it('the zoom record is stored with method zoom and read by the student and the lecturer', async () => {
    const [mine] = await onZoom.pb.collection('attendance_records').getFullList({ filter: `session = "${s1}"` });
    expect(mine).toMatchObject({ method: 'zoom', status: 'present', device_id: '' });
    const all = await h.lecturer.pb.collection('attendance_records').getFullList({ filter: `session = "${s1}"`, sort: 'checked_in_at' });
    expect(all.map((r) => r.method)).toEqual(['qr', 'zoom']);
  });

  it('challenges reach only the students in the room', async () => {
    const ch = (await h.call(h.lecturer, 'POST', `/sessions/${s1}/challenges`, { type: 'rollcall' })).body;
    const seen = (u: TestUser) => u.pb.collection('challenges').getFullList({ filter: `session = "${s1}"` });
    expect((await seen(inRoom)).map((c) => c.id)).toEqual([ch.id]);
    expect(await seen(onZoom)).toEqual([]);
    await h.call(h.lecturer, 'POST', `/challenges/${ch.id}/close`);
  });

  it('a student who only joined from Zoom reads the lecture page after the lecture', async () => {
    const post = (await h.call(inRoom, 'POST', `/sessions/${s1}/posts`, { text: 'מה זה DIP?', anonymous: true })).body;
    await h.call(h.lecturer, 'POST', `/sessions/${s1}/end`);
    await h.call(h.lecturer, 'POST', `/posts/${post.id}/answer`, { text: 'תלות בהפשטות.' });
    const [seen] = await onZoom.pb.collection('feed_posts').getFullList({ filter: `session = "${s1}"` });
    expect(seen).toMatchObject({ id: post.id, answer: 'תלות בהפשטות.' });
  });

  it('the admin role change is written by the API; a user still cannot change their own role', async () => {
    const admins = h.container.admins;
    const promoted = await admins.setRole(h.lecturer.record.id, onZoom.record.id, 'lecturer');
    expect(promoted.role).toBe('lecturer');
    expect((await h.admin.collection('users').getOne(onZoom.record.id)).role).toBe('lecturer');
    await admins.setRole(h.lecturer.record.id, onZoom.record.id, 'student');
    await expect(inRoom.pb.collection('users').update(inRoom.record.id, { role: 'lecturer' })).rejects.toHaveProperty('status');
  });
});
