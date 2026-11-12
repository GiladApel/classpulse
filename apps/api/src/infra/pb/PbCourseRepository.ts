import { ClientResponseError, type RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { CourseRepository } from '../../attendance/repositories.js';
import type { Course } from '../../attendance/types.js';
import { compact, toDate } from './PbRepository.js';

const toCourse = (r: RecordModel): Course => ({
  id: r.id,
  code: r.code,
  name: r.name,
  lecturerId: r.lecturer,
  termStart: toDate(r.term_start),
  termEnd: toDate(r.term_end),
});

export class PbCourseRepository implements CourseRepository {
  constructor(private readonly pb: PocketBase) {}

  async get(id: string): Promise<Course | null> {
    return this.orNull(() => this.pb.collection('courses').getOne(id));
  }

  async create(data: Omit<Course, 'id'>): Promise<Course> {
    return toCourse(await this.pb.collection('courses').create({ code: data.code, name: data.name, lecturer: data.lecturerId }));
  }

  async update(id: string, data: Partial<Omit<Course, 'id' | 'lecturerId'>>): Promise<Course> {
    // An empty string clears a PB date field, so "no term dates" is written explicitly.
    const term = (d: Date | undefined) => (d === undefined ? undefined : d.toISOString());
    const record = compact({ code: data.code, name: data.name, term_start: term(data.termStart), term_end: term(data.termEnd) });
    if ('termStart' in data && !data.termStart) record.term_start = '';
    if ('termEnd' in data && !data.termEnd) record.term_end = '';
    return toCourse(await this.pb.collection('courses').update(id, record));
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
