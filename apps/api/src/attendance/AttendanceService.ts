import type { Clock } from '../infra/Clock.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import type { CheckInContext, CheckInRule } from './CheckInRule.js';
import { GeofencePolicyFactory } from './GeofencePolicyFactory.js';
import type { AttendanceRepository } from './repositories.js';
import type { AttendanceRecord, Session } from './types.js';

export class CheckInRejected extends DomainError {}

export interface CheckInOutcome {
  record: AttendanceRecord;
  alreadyCheckedIn: boolean;
}

export class AttendanceService {
  constructor(
    private readonly baseRules: CheckInRule[],
    private readonly repo: AttendanceRepository,
    private readonly clock: Clock,
  ) {}

  /** Chain of Responsibility: first reject stops; warns accumulate into flags. */
  async checkIn(ctx: CheckInContext): Promise<CheckInOutcome> {
    const rules = [...this.baseRules, GeofencePolicyFactory.for(ctx.session.geofenceMode)];
    let geoFlag = false;
    let distanceM: number | undefined;

    for (const rule of rules) {
      const result = await rule.check(ctx);
      if (result.data?.distanceM !== undefined) distanceM = result.data.distanceM;
      if (result.kind === 'reject') {
        if (result.code === 'ALREADY_CHECKED_IN' && result.data?.recordId) {
          return { record: await this.mustGet(result.data.recordId), alreadyCheckedIn: true };
        }
        throw new CheckInRejected(result.code, result.message ?? result.code);
      }
      if (result.kind === 'warn' && result.code.startsWith('GEO_')) geoFlag = true;
    }

    try {
      const record = await this.repo.create({
        sessionId: ctx.session.id,
        studentId: ctx.studentId,
        studentNumber: ctx.studentNumber,
        studentName: ctx.studentName,
        deviceId: ctx.deviceId,
        checkedInAt: this.clock.now(),
        method: 'qr',
        distanceM,
        geoFlag,
        status: 'present',
        note: '',
      });
      return { record, alreadyCheckedIn: false };
    } catch (e) {
      // Two concurrent scans by the same student: the DB unique index wins, return the first record.
      const existing = await this.repo.findBySessionAndStudentNumber(ctx.session.id, ctx.studentNumber);
      if (existing) return { record: existing, alreadyCheckedIn: true };
      throw e;
    }
  }

  async manualApprove(session: Session, studentNumber: string, studentName: string, note: string): Promise<AttendanceRecord> {
    const existing = await this.repo.findBySessionAndStudentNumber(session.id, studentNumber);
    if (existing && existing.status !== 'removed') return existing;
    if (existing) return this.repo.update(existing.id, { status: 'present', method: 'manual', note });
    return this.repo.create({
      sessionId: session.id,
      studentNumber,
      studentName,
      deviceId: '',
      checkedInAt: this.clock.now(),
      method: 'manual',
      geoFlag: false,
      status: 'present',
      note,
    });
  }

  async remove(recordId: string, reason: string): Promise<AttendanceRecord> {
    await this.mustGet(recordId);
    return this.repo.update(recordId, { status: 'removed', note: reason });
  }

  /** Marks a record for lecturer review (e.g. failed challenge). Removed records stay removed. */
  async flag(recordId: string, reason: string): Promise<AttendanceRecord> {
    const record = await this.mustGet(recordId);
    if (record.status === 'removed') return record;
    return this.repo.update(recordId, { status: 'flagged', note: reason });
  }

  /** Lecturer reviewed a flagged record and keeps it. */
  async confirm(recordId: string): Promise<AttendanceRecord> {
    const record = await this.mustGet(recordId);
    if (record.status !== 'flagged') return record;
    return this.repo.update(recordId, { status: 'present', note: '' });
  }

  async presentCount(sessionId: string): Promise<number> {
    return (await this.repo.listBySession(sessionId)).filter((r) => r.status !== 'removed').length;
  }

  async get(recordId: string): Promise<AttendanceRecord> {
    return this.mustGet(recordId);
  }

  listForSession(sessionId: string): Promise<AttendanceRecord[]> {
    return this.repo.listBySession(sessionId);
  }

  private async mustGet(id: string): Promise<AttendanceRecord> {
    const record = await this.repo.get(id);
    if (!record) throw new NotFoundError('Attendance record');
    return record;
  }
}
