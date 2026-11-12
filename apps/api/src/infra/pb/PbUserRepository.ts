import { ClientResponseError, type RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { ManagedUser, Role, UserRepository } from '../../admin/types.js';

const toUser = (r: RecordModel): ManagedUser => ({
  id: r.id,
  name: r.name ?? '',
  email: r.email ?? '',
  studentNumber: r.student_id ?? '',
  role: r.role === 'lecturer' ? 'lecturer' : 'student',
});

export class PbUserRepository implements UserRepository {
  constructor(private readonly pb: PocketBase) {}

  async get(id: string): Promise<ManagedUser | null> {
    try {
      return toUser(await this.pb.collection('users').getOne(id));
    } catch (e) {
      if (e instanceof ClientResponseError && e.status === 404) return null;
      throw e;
    }
  }

  async search(q: string, limit: number): Promise<ManagedUser[]> {
    const filter = q ? this.pb.filter('name ~ {:q} || email ~ {:q} || student_id ~ {:q}', { q }) : '';
    const page = await this.pb.collection('users').getList(1, limit, { filter, sort: 'name' });
    return page.items.map(toUser);
  }

  async setRole(id: string, role: Role): Promise<ManagedUser> {
    return toUser(await this.pb.collection('users').update(id, { role }));
  }
}
