export type GeofenceMode = 'lenient' | 'strict';
export type SessionStatus = 'active' | 'ended';
export type CheckInMethod = 'qr' | 'manual' | 'zoom';
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
