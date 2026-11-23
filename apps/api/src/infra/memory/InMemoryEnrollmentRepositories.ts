import type { CourseSlotRepository, EnrollmentRepository } from '../../attendance/repositories.js';
import type { CourseSlot, Enrollment } from '../../attendance/types.js';
import { InMemoryRepository } from '../InMemoryRepository.js';

export class InMemoryEnrollmentRepository extends InMemoryRepository<Enrollment> implements EnrollmentRepository {
  async create(data: Omit<Enrollment, 'id'>): Promise<Enrollment> {
    this.checkUnique(data);
    return super.create(data);
  }

  async update(id: string, patch: Partial<Omit<Enrollment, 'id'>>): Promise<Enrollment> {
    const current = this.items.get(id);
    if (current) this.checkUnique({ ...current, ...patch }, id);
    return super.update(id, patch);
  }

  /** Mirrors the unique indexes (course, student_number) and (course, email), each when not empty; synchronous like the DB. */
  private checkUnique(e: Omit<Enrollment, 'id'>, self?: string) {
    const clash = this.all().some(
      (o) => o.id !== self && o.courseId === e.courseId && ((e.studentNumber && o.studentNumber === e.studentNumber) || (e.email && o.email === e.email)),
    );
    if (clash) throw new Error('UNIQUE constraint');
  }

  async findByCourseAndStudent(courseId: string, studentNumber: string) {
    if (!studentNumber) return null;
    return this.all().find((e) => e.courseId === courseId && e.studentNumber === studentNumber) ?? null;
  }

  async findByCourseAndEmail(courseId: string, email: string) {
    if (!email) return null;
    return this.all().find((e) => e.courseId === courseId && e.email === email) ?? null;
  }

  async listByEmail(email: string) {
    return email ? this.all().filter((e) => e.email === email) : [];
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
