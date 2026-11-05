import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { CourseRepository } from '../../attendance/repositories.js';
import type { Course } from '../../attendance/types.js';

export class PbCourseRepository implements CourseRepository {
  constructor(private readonly pb: PocketBase) {}

  async get(id: string): Promise<Course | null> {
    try {
      const r = await this.pb.collection('courses').getOne(id);
      return { id: r.id, code: r.code, name: r.name, lecturerId: r.lecturer };
    } catch (e) {
      if (e instanceof ClientResponseError && e.status === 404) return null;
      throw e;
    }
  }
}
