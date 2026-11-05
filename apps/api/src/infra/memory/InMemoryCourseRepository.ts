import type { CourseRepository } from '../../attendance/repositories.js';
import type { Course } from '../../attendance/types.js';

export class InMemoryCourseRepository implements CourseRepository {
  constructor(private readonly courses: Course[] = []) {}

  async get(id: string): Promise<Course | null> {
    return this.courses.find((c) => c.id === id) ?? null;
  }
}
