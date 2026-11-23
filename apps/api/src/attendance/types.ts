export type GeofenceMode = 'lenient' | 'strict';
export type SessionStatus = 'active' | 'ended';
export type CheckInMethod = 'qr' | 'manual';
export type AttendanceStatus = 'present' | 'flagged' | 'removed';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM?: number;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  lecturerId: string;
  termStart?: Date;
  termEnd?: Date;
}

/**
 * A row of the course roster uploaded by the lecturer. The lecturer gives an email (or, in older rosters, an ID);
 * `studentNumber` is the student's key, '' until a user who signs in with that email is linked to the row.
 */
export interface Enrollment {
  id: string;
  courseId: string;
  email: string;
  studentNumber: string;
  name: string;
  addedAt: Date;
}

/** One weekly meeting of a course: weekday 0 = Sunday, times "HH:MM". */
export interface CourseSlot {
  id: string;
  courseId: string;
  weekday: number;
  starts: string;
  ends: string;
  room: string;
}

export interface Session {
  id: string;
  courseId: string;
  lecturerId: string;
  title: string;
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date;
  location?: GeoPoint;
  geofenceMode: GeofenceMode;
  geofenceRadiusM: number;
  qrSecret: string;
  /** The lecturer asked students to hold their questions until after class. */
  questionsPaused?: boolean;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId?: string;
  studentNumber: string;
  studentName: string;
  deviceId: string;
  checkedInAt: Date;
  method: CheckInMethod;
  distanceM?: number;
  geoFlag: boolean;
  status: AttendanceStatus;
  note: string;
}
