import type { RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { SessionRepository } from '../../attendance/repositories.js';
import type { Session } from '../../attendance/types.js';
import { compact, PbRepository, toDate } from './PbRepository.js';

export class PbSessionRepository extends PbRepository<Session> implements SessionRepository {
  constructor(pb: PocketBase) {
    super(pb, 'sessions', 'course');
  }

  protected toEntity(r: RecordModel): Session {
    const hasLocation = r.geo_lat !== 0 || r.geo_lng !== 0;
    return {
      id: r.id,
      courseId: r.course,
      lecturerId: r.expand?.course?.lecturer,
      title: r.title,
      status: r.status,
      startedAt: toDate(r.started_at)!,
      endedAt: toDate(r.ended_at),
      location: hasLocation ? { lat: r.geo_lat, lng: r.geo_lng } : undefined,
      geofenceMode: r.geofence_mode,
      geofenceRadiusM: r.geo_radius_m,
      qrSecret: r.qr_secret,
    };
  }

  protected toRecord(d: Partial<Omit<Session, 'id'>>): Record<string, unknown> {
    return compact({
      course: d.courseId,
      title: d.title,
      status: d.status,
      started_at: d.startedAt?.toISOString(),
      ended_at: d.endedAt?.toISOString(),
      geo_lat: d.location?.lat,
      geo_lng: d.location?.lng,
      geofence_mode: d.geofenceMode,
      geo_radius_m: d.geofenceRadiusM,
      qr_secret: d.qrSecret,
    });
  }
}
