import type { Repository } from '../infra/Repository.js';
import type { AttendanceRecord, Course, Session } from './types.js';

export interface AttendanceRepository extends Repository<AttendanceRecord> {
  findBySessionAndStudentNumber(sessionId: string, studentNumber: string): Promise<AttendanceRecord | null>;
  findBySessionAndDevice(sessionId: string, deviceId: string): Promise<AttendanceRecord | null>;
  listBySession(sessionId: string): Promise<AttendanceRecord[]>;
  /** True if the student attended (and was not removed from) any session of the course. */
  attendedCourse(courseId: string, studentNumber: string): Promise<boolean>;
}

export type SessionRepository = Repository<Session>;

export interface CourseRepository {
  get(id: string): Promise<Course | null>;
}
