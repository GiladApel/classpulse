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

/** A row of the course roster uploaded by the lecturer, keyed by student ID. */
export interface Enrollment {
  id: string;
  courseId: string;
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
