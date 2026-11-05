import type { CheckInContext } from '../attendance/CheckInRule.js';
import type { Session } from '../attendance/types.js';

export const T0 = new Date('2026-11-05T08:00:00.000Z');
export const CLASSROOM = { lat: 32.1048, lng: 35.2073 };

export function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: 'sess1',
    courseId: 'course1',
    lecturerId: 'lect1',
    title: 'Lecture 5',
    status: 'active',
    startedAt: T0,
    location: CLASSROOM,
    geofenceMode: 'lenient',
    geofenceRadiusM: 50,
    qrSecret: 'test-secret',
    ...over,
  };
}

export function makeCtx(over: Partial<CheckInContext> = {}): CheckInContext {
  return {
    session: makeSession(),
    studentId: 'u1',
    studentNumber: '123456789',
    studentName: 'דנה כהן',
    deviceId: 'dev-1',
    token: '',
    location: CLASSROOM,
    now: T0,
    ...over,
  };
}

/** Point roughly `meters` north of `from`. */
export const north = (from: { lat: number; lng: number }, meters: number) => ({
  lat: from.lat + meters / 111_320,
  lng: from.lng,
});
