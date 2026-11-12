import type { RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { CourseSlotRepository, EnrollmentRepository } from '../../attendance/repositories.js';
import type { CourseSlot, Enrollment } from '../../attendance/types.js';
import { compact, PbRepository, toDate } from './PbRepository.js';

export class PbEnrollmentRepository extends PbRepository<Enrollment> implements EnrollmentRepository {
  constructor(pb: PocketBase) {
    super(pb, 'enrollments');
  }

  findByCourseAndStudent(courseId: string, studentNumber: string) {
    return this.first('course = {:c} && student_number = {:n}', { c: courseId, n: studentNumber });
  }

  async listByCourse(courseId: string) {
    const list = await this.col.getFullList({ filter: this.pb.filter('course = {:c}', { c: courseId }), sort: 'name' });
    return list.map((r) => this.toEntity(r));
  }

  async delete(id: string) {
    await this.col.delete(id);
  }

  protected toEntity(r: RecordModel): Enrollment {
    return { id: r.id, courseId: r.course, studentNumber: r.student_number, name: r.name, addedAt: toDate(r.added_at)! };
  }

  protected toRecord(d: Partial<Omit<Enrollment, 'id'>>): Record<string, unknown> {
    return compact({ course: d.courseId, student_number: d.studentNumber, name: d.name, added_at: d.addedAt?.toISOString() });
  }
}

export class PbCourseSlotRepository implements CourseSlotRepository {
  constructor(private readonly pb: PocketBase) {}

  async listByCourse(courseId: string) {
    const list = await this.pb.collection('course_slots').getFullList({ filter: this.pb.filter('course = {:c}', { c: courseId }), sort: 'weekday,starts' });
    return list.map(toSlot);
  }

  async replaceForCourse(courseId: string, slots: Omit<CourseSlot, 'id' | 'courseId'>[]) {
    const col = this.pb.collection('course_slots');
    for (const old of await this.listByCourse(courseId)) await col.delete(old.id);
    const created: CourseSlot[] = [];
    for (const s of slots) created.push(toSlot(await col.create({ course: courseId, weekday: s.weekday, starts: s.starts, ends: s.ends, room: s.room })));
    return created;
  }
}

const toSlot = (r: RecordModel): CourseSlot => ({ id: r.id, courseId: r.course, weekday: r.weekday, starts: r.starts, ends: r.ends, room: r.room ?? '' });
