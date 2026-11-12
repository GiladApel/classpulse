import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness.js';

describe('Integration: admin roles against real PocketBase', () => {
  let h: Harness;
  let student: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    h = await createHarness();
    [student, other] = [await h.makeUser('student', h.studentNo()), await h.makeUser('student', h.studentNo())];
  });

  afterAll(async () => {
    await h?.cleanup();
  });

  it('the admin role change is written by the API; a user still cannot change their own role', async () => {
    const admins = h.container.admins;
    const promoted = await admins.setRole(h.lecturer.record.id, student.record.id, 'lecturer');
    expect(promoted.role).toBe('lecturer');
    expect((await h.admin.collection('users').getOne(student.record.id)).role).toBe('lecturer');
    await admins.setRole(h.lecturer.record.id, student.record.id, 'student');
    await expect(other.pb.collection('users').update(other.record.id, { role: 'lecturer' })).rejects.toHaveProperty('status');
  });
});
