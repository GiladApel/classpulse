import type { CourseRepository } from '../../attendance/repositories.js';
import type { Course } from '../../attendance/types.js';
import { NotFoundError } from '../../shared/errors.js';

export class InMemoryCourseRepository implements CourseRepository {
  constructor(private readonly courses: Course[] = []) {}

  async get(id: string): Promise<Course | null> {
    return this.courses.find((c) => c.id === id) ?? null;
  }

  async create(data: Omit<Course, 'id'>): Promise<Course> {
    const course = { ...data, id: `course${this.courses.length + 1}` };
    this.courses.push(course);
    return course;
  }

  async update(id: string, data: Partial<Omit<Course, 'id' | 'lecturerId'>>): Promise<Course> {
    const course = this.courses.find((c) => c.id === id);
    if (!course) throw new NotFoundError('Course');
    Object.assign(course, data);
    return { ...course };
  }

  async findByLecturerAndCode(lecturerId: string, code: string): Promise<Course | null> {
    return this.courses.find((c) => c.lecturerId === lecturerId && c.code === code) ?? null;
  }
}
