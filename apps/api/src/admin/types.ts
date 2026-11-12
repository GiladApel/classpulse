import type { Repository } from '../infra/Repository.js';

export type Role = 'student' | 'lecturer';

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  studentNumber: string;
  role: Role;
}

export interface UserRepository extends Pick<Repository<ManagedUser>, 'get'> {
  /** Name or email contains q (case-insensitive); empty q lists everyone. */
  search(q: string, limit: number): Promise<ManagedUser[]>;
  setRole(id: string, role: Role): Promise<ManagedUser>;
}
