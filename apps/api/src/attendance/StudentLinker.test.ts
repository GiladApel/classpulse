import { beforeEach, describe, expect, it } from 'vitest';
import type { ManagedUser } from '../admin/types.js';
import { InMemoryEnrollmentRepository } from '../infra/memory/InMemoryEnrollmentRepositories.js';
import { InMemoryUserRepository } from '../infra/memory/InMemoryUserRepository.js';
import { T0 } from '../test/fixtures.js';
import { randomStudentKey, StudentLinker } from './StudentLinker.js';

const user = (over: Partial<ManagedUser>): ManagedUser => ({ id: 'u1', name: 'דנה', email: 'dana@x.com', studentNumber: '', role: 'student', ...over });

describe('StudentLinker', () => {
  let rows: InMemoryEnrollmentRepository;
  let people: ManagedUser[];
  let linker: StudentLinker;
  let keys: string[];

  beforeEach(() => {
    rows = new InMemoryEnrollmentRepository();
    people = [];
    keys = ['000000000111', '000000000222'];
    linker = new StudentLinker(rows, new InMemoryUserRepository(people), () => keys.shift()!);
  });

  const row = (courseId: string, email: string, studentNumber = '', name = '') => rows.create({ courseId, email, studentNumber, name, addedAt: T0 });

  it('gives a new user a generated key and links every roster row with their email', async () => {
    people.push(user({}));
    await row('c1', 'dana@x.com');
    await row('c2', 'dana@x.com');
    await row('c2', 'other@x.com');

    expect(await linker.link(user({}))).toEqual({ studentNumber: '000000000111', courses: 2 });
    expect(people[0].studentNumber).toBe('000000000111');
    expect((await rows.listByEmail('dana@x.com')).map((r) => r.studentNumber)).toEqual(['000000000111', '000000000111']);
    expect((await rows.listByEmail('other@x.com'))[0].studentNumber).toBe('');
  });

  it('matches the sign-in email in any case, and is idempotent', async () => {
    people.push(user({ email: 'Dana@X.com' }));
    await row('c1', 'dana@x.com');
    await linker.link(user({ email: 'Dana@X.com' }));
    expect(await linker.link({ ...people[0] })).toEqual({ studentNumber: '000000000111', courses: 1 });
  });

  it("uses the roster's ID as the key when the lecturer gave one, unless another user already has it", async () => {
    people.push(user({}));
    await row('c1', 'dana@x.com', '123456789');
    expect((await linker.link(user({}))).studentNumber).toBe('123456789');

    // A typo: Avi's row carries Dana's ID. Avi gets a generated key and Dana keeps hers.
    people.push(user({ id: 'u2', email: 'avi@x.com' }));
    await row('c2', 'avi@x.com', '123456789');
    expect((await linker.link(user({ id: 'u2', email: 'avi@x.com' }))).studentNumber).toBe('000000000111');
    expect(people[0].studentNumber).toBe('123456789');
  });

  it('keeps the key of a user who already has one (an ID typed before emails), and writes it into the row', async () => {
    people.push(user({ studentNumber: '987654321' }));
    await row('c1', 'dana@x.com', '111111111');
    expect(await linker.link({ ...people[0] })).toEqual({ studentNumber: '987654321', courses: 1 });
    expect((await rows.findByCourseAndEmail('c1', 'dana@x.com'))!.studentNumber).toBe('987654321');
  });

  it('merges an email row into an older ID-only row of the same student in that course', async () => {
    people.push(user({ studentNumber: '987654321' }));
    const old = await row('c1', '', '987654321', 'דנה כהן');
    await row('c1', 'dana@x.com');
    await linker.link({ ...people[0] });
    expect(await rows.listByCourse('c1')).toEqual([{ ...old, email: 'dana@x.com' }]);
  });

  it('a user with no roster rows still gets a key, so they can check in to a lesson in the room', async () => {
    people.push(user({}));
    expect(await linker.link(user({}))).toEqual({ studentNumber: '000000000111', courses: 0 });
  });

  it('skips a generated key that is already taken', async () => {
    people.push(user({ id: 'u0', email: 'z@x.com', studentNumber: '000000000111' }), user({}));
    expect((await linker.link(user({}))).studentNumber).toBe('000000000222');
  });

  describe('linkRow (the lecturer added a row or fixed its email)', () => {
    it('links the row at once when a user with that email has already signed in', async () => {
      people.push(user({ studentNumber: '987654321' }));
      const r = await row('c1', 'dana@x.com');
      expect((await linker.linkRow(r)).studentNumber).toBe('987654321');
    });

    it('leaves the row waiting when nobody signed in with the email yet, or it has no email, or it is a lecturer', async () => {
      const waiting = await row('c1', 'nobody@x.com');
      expect(await linker.linkRow(waiting)).toEqual(waiting);
      const idOnly = await row('c1', '', '123456789');
      expect(await linker.linkRow(idOnly)).toEqual(idOnly);
      people.push(user({ email: 'lect@x.com', role: 'lecturer' }));
      const lecturer = await row('c1', 'lect@x.com');
      expect(await linker.linkRow(lecturer)).toEqual(lecturer);
    });
  });

  it('generates 12-digit keys', () => {
    expect(randomStudentKey()).toMatch(/^\d{12}$/);
  });
});
