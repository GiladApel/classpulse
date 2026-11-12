import { describe, expect, it } from 'vitest';
import { InMemoryUserRepository } from '../infra/memory/InMemoryUserRepository.js';
import type { ManagedUser } from './types.js';
import { UserAdminService } from './UserAdminService.js';

const users = (): ManagedUser[] => [
  { id: 'a', name: 'גלעד', email: 'Gilad@Example.com', studentNumber: '', role: 'lecturer' },
  { id: 'b', name: 'דנה', email: 'dana@x', studentNumber: '111', role: 'student' },
  { id: 'c', name: 'אבי', email: 'avi@x', studentNumber: '222', role: 'student' },
];

describe('UserAdminService', () => {
  const make = () => new UserAdminService(new InMemoryUserRepository(users()), [' gilad@example.COM ', '']);

  it('admins come from the configured emails, case-insensitively; an empty entry admits nobody', () => {
    const s = make();
    expect(s.isAdmin('gilad@example.com')).toBe(true);
    expect(s.isAdmin('dana@x')).toBe(false);
    expect(s.isAdmin('')).toBe(false);
  });

  it('searches by name, email or student number; empty lists everyone', async () => {
    const s = make();
    expect((await s.search('')).map((u) => u.id)).toHaveLength(3);
    expect((await s.search(' DANA ')).map((u) => u.id)).toEqual(['b']);
    expect((await s.search('222')).map((u) => u.id)).toEqual(['c']);
  });

  it('promotes and demotes others, never the admin themself; unknown users are not found', async () => {
    const s = make();
    expect(await s.setRole('a', 'b', 'lecturer')).toMatchObject({ id: 'b', role: 'lecturer' });
    expect(await s.setRole('a', 'b', 'student')).toMatchObject({ role: 'student' });
    await expect(s.setRole('a', 'a', 'student')).rejects.toMatchObject({ code: 'OWN_ROLE' });
    await expect(s.setRole('a', 'zz', 'lecturer')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
