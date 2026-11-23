import type { Repository } from '../infra/Repository.js';
import type { AttendanceRecord, Course, CourseSlot, Enrollment, Session } from './types.js';

export interface AttendanceRepository extends Repository<AttendanceRecord> {
  findBySessionAndStudentNumber(sessionId: string, studentNumber: string): Promise<AttendanceRecord | null>;
  findBySessionAndDevice(sessionId: string, deviceId: string): Promise<AttendanceRecord | null>;
  listBySession(sessionId: string): Promise<AttendanceRecord[]>;
  /** True if the student attended (and was not removed from) any session of the course. */
  attendedCourse(courseId: string, studentNumber: string): Promise<boolean>;
}

export interface SessionRepository extends Repository<Session> {
  countByCourse(courseId: string): Promise<number>;
  listByCourse(courseId: string): Promise<Session[]>;
}

export interface CourseRepository {
  get(id: string): Promise<Course | null>;
  create(data: Omit<Course, 'id'>): Promise<Course>;
  update(id: string, data: Partial<Omit<Course, 'id' | 'lecturerId'>>): Promise<Course>;
  findByLecturerAndCode(lecturerId: string, code: string): Promise<Course | null>;
}

export interface EnrollmentRepository extends Repository<Enrollment> {
  findByCourseAndStudent(courseId: string, studentNumber: string): Promise<Enrollment | null>;
  findByCourseAndEmail(courseId: string, email: string): Promise<Enrollment | null>;
  /** Rows with this email in every course, for linking a user who signs in with it. */
  listByEmail(email: string): Promise<Enrollment[]>;
  listByCourse(courseId: string): Promise<Enrollment[]>;
  delete(id: string): Promise<void>;
}

export interface CourseSlotRepository {
  listByCourse(courseId: string): Promise<CourseSlot[]>;
  /** The timetable is edited as a whole: the new slots replace all of the course's slots. */
  replaceForCourse(courseId: string, slots: Omit<CourseSlot, 'id' | 'courseId'>[]): Promise<CourseSlot[]>;
}
