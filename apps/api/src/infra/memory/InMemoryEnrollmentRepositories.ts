import type { CourseSlotRepository, EnrollmentRepository } from '../../attendance/repositories.js';
import type { CourseSlot, Enrollment } from '../../attendance/types.js';
import { InMemoryRepository } from '../InMemoryRepository.js';

export class InMemoryEnrollmentRepository extends InMemoryRepository<Enrollment> implements EnrollmentRepository {
  async create(data: Omit<Enrollment, 'id'>): Promise<Enrollment> {
    // Mirrors the unique index (course, student_number), checked synchronously like the DB.
    if (this.all().some((e) => e.courseId === data.courseId && e.studentNumber === data.studentNumber)) throw new Error('UNIQUE constraint');
    return super.create(data);
  }

  async findByCourseAndStudent(courseId: string, studentNumber: string) {
    return this.all().find((e) => e.courseId === courseId && e.studentNumber === studentNumber) ?? null;
  }

  async listByCourse(courseId: string) {
    return this.all()
      .filter((e) => e.courseId === courseId)
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }

  async delete(id: string) {
    this.items.delete(id);
  }
}

export class InMemoryCourseSlotRepository implements CourseSlotRepository {
  private slots: CourseSlot[] = [];
  private seq = 0;

  async listByCourse(courseId: string) {
    return this.slots.filter((s) => s.courseId === courseId);
  }

  async replaceForCourse(courseId: string, slots: Omit<CourseSlot, 'id' | 'courseId'>[]) {
    this.slots = this.slots.filter((s) => s.courseId !== courseId);
    const created = slots.map((s) => ({ ...s, courseId, id: `slot${++this.seq}` }));
    this.slots.push(...created);
    return created;
  }
}
