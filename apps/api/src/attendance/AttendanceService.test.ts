import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../infra/Clock.js';
import { InMemoryAttendanceRepository } from '../infra/memory/InMemoryAttendanceRepository.js';
import { CLASSROOM, makeCtx, makeSession, north, T0 } from '../test/fixtures.js';
import { AttendanceService, CheckInRejected } from './AttendanceService.js';
import { type CheckInRule, pass, reject } from './CheckInRule.js';
import { DuplicateStudentRule } from './DuplicateStudentRule.js';

describe('AttendanceService', () => {
  let repo: InMemoryAttendanceRepository;
  let clock: FixedClock;
  const svc = (rules: CheckInRule[]) => new AttendanceService(rules, repo, clock);

  beforeEach(() => {
    repo = new InMemoryAttendanceRepository();
    clock = new FixedClock(T0);
  });

  it('creates a present record when every rule passes', async () => {
    const { record, alreadyCheckedIn } = await svc([]).checkIn(makeCtx({ location: north(CLASSROOM, 10) }));
    expect(alreadyCheckedIn).toBe(false);
    expect(record).toMatchObject({ status: 'present', method: 'qr', geoFlag: false, distanceM: 10, checkedInAt: T0 });
  });

  it('stops at the first reject — later rules are not called', async () => {
    const later = { check: vi.fn(async () => pass()) };
    const first = { check: async () => reject('NOPE', 'לא') };
    await expect(svc([first, later]).checkIn(makeCtx())).rejects.toBeInstanceOf(CheckInRejected);
    expect(later.check).not.toHaveBeenCalled();
    expect(await repo.listBySession('sess1')).toHaveLength(0);
  });

  it('appends the strict geofence policy from the session and rejects far students', async () => {
    const ctx = makeCtx({ session: makeSession({ geofenceMode: 'strict' }), location: north(CLASSROOM, 400) });
    await expect(svc([]).checkIn(ctx)).rejects.toMatchObject({ code: 'GEO_OUTSIDE' });
  });

  it('lenient geofence warning sets geoFlag but keeps the student present', async () => {
    const { record } = await svc([]).checkIn(makeCtx({ location: north(CLASSROOM, 400) }));
    expect(record).toMatchObject({ status: 'present', geoFlag: true, distanceM: 400 });
  });

  it('is idempotent: a second check-in returns the existing record', async () => {
    const s = svc([new DuplicateStudentRule(repo)]);
    const first = await s.checkIn(makeCtx());
    const second = await s.checkIn(makeCtx());
    expect(second).toEqual({ record: first.record, alreadyCheckedIn: true });
  });

  it('resolves a concurrent duplicate (DB unique index) to the existing record', async () => {
    const s = svc([]);
    const [a, b] = await Promise.all([s.checkIn(makeCtx()), s.checkIn(makeCtx())]);
    expect(a.record.id).toBe(b.record.id);
    expect([a.alreadyCheckedIn, b.alreadyCheckedIn].sort()).toEqual([false, true]);
  });

  describe('manualApprove', () => {
    const session = makeSession();

    it('creates a manual record without a device', async () => {
      const r = await svc([]).manualApprove(session, '555', 'יוסי', 'טלפון מת');
      expect(r).toMatchObject({ method: 'manual', deviceId: '', status: 'present', note: 'טלפון מת' });
    });

    it('returns an existing present record unchanged', async () => {
      const { record } = await svc([]).checkIn(makeCtx());
      expect(await svc([]).manualApprove(session, record.studentNumber, 'x', 'y')).toEqual(record);
    });

    it('restores a removed record as manual', async () => {
      const s = svc([]);
      const { record } = await s.checkIn(makeCtx());
      await s.remove(record.id, 'mistake');
      expect(await s.manualApprove(session, record.studentNumber, 'x', 'ok')).toMatchObject({
        id: record.id,
        status: 'present',
        method: 'manual',
      });
    });
  });

  it('remove keeps the row for audit with status removed and the reason', async () => {
    const s = svc([]);
    const { record } = await s.checkIn(makeCtx());
    expect(await s.remove(record.id, 'not in class')).toMatchObject({ status: 'removed', note: 'not in class' });
    expect(await s.listForSession('sess1')).toHaveLength(1);
  });

  it('remove of an unknown record throws NOT_FOUND', async () => {
    await expect(svc([]).remove('nope', 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
