import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../infra/Clock.js';
import { InMemoryAttendanceRepository } from '../infra/memory/InMemoryAttendanceRepository.js';
import { CLASSROOM, makeCtx, makeSession, north, T0 } from '../test/fixtures.js';
import { AttendanceService, CheckInRejected } from './AttendanceService.js';
import { type CheckInContext, type CheckInRule, pass, reject } from './CheckInRule.js';
import { DuplicateStudentRule } from './DuplicateStudentRule.js';
import { SessionActiveRule } from './SessionActiveRule.js';

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

  describe('joinRemote', () => {
    const remote = () => {
      const rules = [new DuplicateStudentRule(repo), new SessionActiveRule()];
      return new AttendanceService([new DuplicateStudentRule(repo)], repo, clock, rules);
    };
    const zoomCtx = (over: Partial<CheckInContext> = {}) => ({ session: makeSession(), studentId: 'u1', studentNumber: '123456789', studentName: 'דנה כהן', now: T0, ...over });

    it('records a zoom attendance without device or location', async () => {
      const { record, alreadyCheckedIn } = await remote().joinRemote(zoomCtx());
      expect(alreadyCheckedIn).toBe(false);
      expect(record).toMatchObject({ method: 'zoom', status: 'present', deviceId: '', geoFlag: false, distanceM: undefined });
    });

    it('the first record wins: room then zoom, or zoom then room, is one record', async () => {
      const s = remote();
      const room = await s.checkIn(makeCtx());
      expect(await s.joinRemote(zoomCtx())).toEqual({ record: room.record, alreadyCheckedIn: true });
      const zoom = await s.joinRemote(zoomCtx({ studentNumber: '987654321' }));
      expect((await s.checkIn(makeCtx({ studentNumber: '987654321', deviceId: 'dev-2' }))).record).toEqual(zoom.record);
    });

    it('rejects an ended lecture and a removed student', async () => {
      const s = remote();
      await expect(s.joinRemote(zoomCtx({ session: makeSession({ status: 'ended' }) }))).rejects.toMatchObject({ code: 'SESSION_ENDED' });
      const { record } = await s.joinRemote(zoomCtx());
      await s.remove(record.id, 'x');
      await expect(s.joinRemote(zoomCtx())).rejects.toMatchObject({ code: 'REMOVED' });
    });

    it('inRoomCount leaves out zoom and removed students; presentCount counts zoom', async () => {
      const s = remote();
      await s.checkIn(makeCtx());
      await s.joinRemote(zoomCtx({ studentNumber: '2' }));
      const { record } = await s.checkIn(makeCtx({ studentNumber: '3', deviceId: 'dev-3' }));
      await s.remove(record.id, 'x');
      expect(await s.inRoomCount('sess1')).toBe(1);
      expect(await s.presentCount('sess1')).toBe(2);
    });
  });
});
