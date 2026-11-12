import { api, type SessionDto } from './api';
import { getLocation } from './device';

/** One tap: a lesson with the usual defaults (lenient location check, 50 m, "הרצאה N"). */
export async function startLesson(courseId: string): Promise<SessionDto> {
  const location = await getLocation(8000);
  return api.post<SessionDto>('/sessions', { courseId, geofenceMode: 'lenient', geofenceRadiusM: 50, location });
}
