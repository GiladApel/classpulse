import type { SessionRepository } from '../../attendance/repositories.js';
import type { Session } from '../../attendance/types.js';
import { InMemoryRepository } from '../InMemoryRepository.js';

export class InMemorySessionRepository extends InMemoryRepository<Session> implements SessionRepository {
  async countByCourse(courseId: string) {
    return this.all().filter((s) => s.courseId === courseId).length;
  }
}
