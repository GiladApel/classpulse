import { ClientResponseError, type RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { CourseRepository } from '../../attendance/repositories.js';
import type { Course } from '../../attendance/types.js';

const toCourse = (r: RecordModel): Course => ({ id: r.id, code: r.code, name: r.name, lecturerId: r.lecturer });

export class PbCourseRepository implements CourseRepository {
  constructor(private readonly pb: PocketBase) {}

  async get(id: string): Promise<Course | null> {
    return this.orNull(() => this.pb.collection('courses').getOne(id));
  }

  async create(data: Omit<Course, 'id'>): Promise<Course> {
    return toCourse(await this.pb.collection('courses').create({ code: data.code, name: data.name, lecturer: data.lecturerId }));
  }

  findByLecturerAndCode(lecturerId: string, code: string): Promise<Course | null> {
    return this.orNull(() => this.pb.collection('courses').getFirstListItem(this.pb.filter('lecturer = {:l} && code = {:c}', { l: lecturerId, c: code })));
  }

  private async orNull(fetch: () => Promise<RecordModel>): Promise<Course | null> {
    try {
      return toCourse(await fetch());
    } catch (e) {
      if (e instanceof ClientResponseError && e.status === 404) return null;
      throw e;
    }
  }
}
