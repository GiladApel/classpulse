import type { AttendanceRepository } from '../../attendance/repositories.js';
import type { AttendanceRecord, Session } from '../../attendance/types.js';
import { InMemoryRepository } from '../InMemoryRepository.js';

export class InMemoryAttendanceRepository extends InMemoryRepository<AttendanceRecord> implements AttendanceRepository {
  /** Sessions are needed to answer course-level questions, like PB's relation filter does. */
  constructor(private readonly sessions?: { get(id: string): Promise<Session | null> }) {
    super();
  }

  async attendedCourse(courseId: string, studentNumber: string) {
    for (const r of this.all()) {
      if (r.studentNumber !== studentNumber || r.status === 'removed') continue;
      if ((await this.sessions?.get(r.sessionId))?.courseId === courseId) return true;
    }
    return false;
  }

  async create(data: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecord> {
    // Mirrors the DB unique index (session, student_number); checked synchronously so it is atomic like the DB.
    const taken = this.all().some((r) => r.sessionId === data.sessionId && r.studentNumber === data.studentNumber);
    if (taken) throw new Error('UNIQUE constraint');
    return super.create(data);
  }

  async findBySessionAndStudentNumber(sessionId: string, studentNumber: string) {
    return this.all().find((r) => r.sessionId === sessionId && r.studentNumber === studentNumber) ?? null;
  }

  async findBySessionAndDevice(sessionId: string, deviceId: string) {
    return this.all().find((r) => r.sessionId === sessionId && r.deviceId === deviceId) ?? null;
  }

  async listBySession(sessionId: string) {
    return this.all()
      .filter((r) => r.sessionId === sessionId)
      .sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime());
  }
}
