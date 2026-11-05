import type { AttendanceRecord, Session } from '../attendance/types.js';

export const recordDto = (r: AttendanceRecord) => ({
  id: r.id,
  sessionId: r.sessionId,
  studentNumber: r.studentNumber,
  studentName: r.studentName,
  checkedInAt: r.checkedInAt.toISOString(),
  method: r.method,
  distanceM: r.distanceM ?? null,
  geoFlag: r.geoFlag,
  status: r.status,
  note: r.note,
});

/** Never includes qrSecret. */
export const sessionDto = (s: Session) => ({
  id: s.id,
  courseId: s.courseId,
  title: s.title,
  status: s.status,
  startedAt: s.startedAt.toISOString(),
  endedAt: s.endedAt?.toISOString() ?? null,
  hasLocation: !!s.location,
  geofenceMode: s.geofenceMode,
  geofenceRadiusM: s.geofenceRadiusM,
});
