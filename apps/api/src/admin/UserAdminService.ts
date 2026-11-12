import { DomainError, NotFoundError } from '../shared/errors.js';
import type { ManagedUser, Role, UserRepository } from './types.js';

export const SEARCH_LIMIT = 50;

/** Admins (by email, from ADMIN_EMAILS) decide who is a lecturer. Courses are then created by the lecturers. */
export class UserAdminService {
  private readonly admins: Set<string>;

  constructor(
    private readonly users: UserRepository,
    adminEmails: string[],
  ) {
    this.admins = new Set(adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  }

  isAdmin(email: string): boolean {
    return this.admins.has(email.trim().toLowerCase());
  }

  search(q: string): Promise<ManagedUser[]> {
    return this.users.search(q.trim(), SEARCH_LIMIT);
  }

  async setRole(actorId: string, userId: string, role: Role): Promise<ManagedUser> {
    if (actorId === userId) throw new DomainError('OWN_ROLE', 'אי אפשר לשנות את התפקיד של עצמך');
    if (!(await this.users.get(userId))) throw new NotFoundError('User');
    return this.users.setRole(userId, role);
  }
}
