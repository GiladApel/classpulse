import type { RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { AttendanceRepository } from '../../attendance/repositories.js';
import type { AttendanceRecord } from '../../attendance/types.js';
import { compact, PbRepository, toDate } from './PbRepository.js';

export class PbAttendanceRepository extends PbRepository<AttendanceRecord> implements AttendanceRepository {
  constructor(pb: PocketBase) {
    super(pb, 'attendance_records');
  }

  findBySessionAndStudentNumber(sessionId: string, studentNumber: string) {
    return this.first('session = {:s} && student_number = {:n}', { s: sessionId, n: studentNumber });
  }

  findBySessionAndDevice(sessionId: string, deviceId: string) {
    return this.first('session = {:s} && device_id = {:d}', { s: sessionId, d: deviceId });
  }

  async listBySession(sessionId: string): Promise<AttendanceRecord[]> {
    const list = await this.col.getFullList({ filter: this.pb.filter('session = {:s}', { s: sessionId }), sort: 'checked_in_at' });
    return list.map((r) => this.toEntity(r));
  }

  protected toEntity(r: RecordModel): AttendanceRecord {
    return {
      id: r.id,
      sessionId: r.session,
      studentId: r.student || undefined,
      studentNumber: r.student_number,
      studentName: r.student_name,
      deviceId: r.device_id,
      checkedInAt: toDate(r.checked_in_at)!,
      method: r.method,
      distanceM: r.distance_m === null || r.distance_m === undefined || r.distance_m < 0 ? undefined : r.distance_m,
      geoFlag: r.geo_flag,
      status: r.status,
      note: r.note,
    };
  }

  protected toRecord(d: Partial<Omit<AttendanceRecord, 'id'>>): Record<string, unknown> {
    return compact({
      session: d.sessionId,
      student: d.studentId,
      student_number: d.studentNumber,
      student_name: d.studentName,
      device_id: d.deviceId,
      checked_in_at: d.checkedInAt?.toISOString(),
      method: d.method,
      // PB number fields can't be null; -1 means "unknown distance".
      distance_m: 'distanceM' in d ? (d.distanceM ?? -1) : undefined,
      geo_flag: d.geoFlag,
      status: d.status,
      note: d.note,
    });
  }
}
