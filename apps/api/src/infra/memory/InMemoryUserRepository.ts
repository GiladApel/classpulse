import type { ManagedUser, Role, UserRepository } from '../../admin/types.js';

export class InMemoryUserRepository implements UserRepository {
  constructor(private readonly users: ManagedUser[] = []) {}

  async get(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async search(q: string, limit: number) {
    const needle = q.toLowerCase();
    return this.users
      .filter((u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle) || u.studentNumber.includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  async setRole(id: string, role: Role) {
    const user = this.users.find((u) => u.id === id)!;
    user.role = role;
    return { ...user };
  }
}
