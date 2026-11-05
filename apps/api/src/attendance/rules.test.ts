import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../infra/Clock.js';
import { InMemoryAttendanceRepository } from '../infra/memory/InMemoryAttendanceRepository.js';
import { CLASSROOM, makeCtx, makeSession, north, T0 } from '../test/fixtures.js';
import { DeviceBindingRule } from './DeviceBindingRule.js';
import { DuplicateStudentRule } from './DuplicateStudentRule.js';
import { GeofencePolicyFactory } from './GeofencePolicyFactory.js';
import { GeoMath } from './GeoMath.js';
import { LenientGeofencePolicy } from './LenientGeofencePolicy.js';
import { QrTokenService } from './QrTokenService.js';
import { SessionActiveRule } from './SessionActiveRule.js';
import { StrictGeofencePolicy } from './StrictGeofencePolicy.js';
import { TokenRule } from './TokenRule.js';
import type { AttendanceRecord } from './types.js';

const record = (over: Partial<AttendanceRecord> = {}): Omit<AttendanceRecord, 'id'> => ({
  sessionId: 'sess1',
  studentNumber: '123456789',
  studentName: 'דנה',
  deviceId: 'dev-1',
  checkedInAt: T0,
  method: 'qr',
  geoFlag: false,
  status: 'present',
  note: '',
  ...over,
});

describe('TokenRule', () => {
  const clock = new FixedClock(T0);
  const qr = new QrTokenService(clock);
  const rule = new TokenRule(qr);
  const session = makeSession();

  it('passes a fresh token', async () => {
    const token = qr.issue(session.id, session.qrSecret);
    expect((await rule.check(makeCtx({ token }))).kind).toBe('pass');
  });

  it('rejects an expired token with a Hebrew message', async () => {
    const token = qr.issue(session.id, session.qrSecret);
    clock.advance(25_000);
    const r = await rule.check(makeCtx({ token }));
    expect(r).toMatchObject({ kind: 'reject', code: 'TOKEN_EXPIRED' });
    expect(r.message).toMatch(/סרקו שוב/);
    clock.advance(-25_000);
  });

  it('rejects a token issued for another session', async () => {
    const token = qr.issue('other', session.qrSecret);
    expect(await rule.check(makeCtx({ token }))).toMatchObject({ kind: 'reject', code: 'TOKEN_INVALID' });
  });
});

describe('SessionActiveRule', () => {
  it('passes active, rejects ended', async () => {
    const rule = new SessionActiveRule();
    expect((await rule.check(makeCtx())).kind).toBe('pass');
    const ended = makeCtx({ session: makeSession({ status: 'ended' }) });
    expect(await rule.check(ended)).toMatchObject({ kind: 'reject', code: 'SESSION_ENDED' });
  });
});

describe('DuplicateStudentRule', () => {
  let repo: InMemoryAttendanceRepository;
  beforeEach(() => (repo = new InMemoryAttendanceRepository()));

  it('passes the first check-in', async () => {
    expect((await new DuplicateStudentRule(repo).check(makeCtx())).kind).toBe('pass');
  });

  it('rejects a second check-in and points at the existing record', async () => {
    const existing = await repo.create(record());
    const r = await new DuplicateStudentRule(repo).check(makeCtx());
    expect(r).toMatchObject({ kind: 'reject', code: 'ALREADY_CHECKED_IN', data: { recordId: existing.id } });
  });

  it('rejects a student whose record was removed by the lecturer', async () => {
    await repo.create(record({ status: 'removed' }));
    expect(await new DuplicateStudentRule(repo).check(makeCtx())).toMatchObject({ code: 'REMOVED' });
  });
});

describe('DeviceBindingRule', () => {
  let repo: InMemoryAttendanceRepository;
  beforeEach(() => (repo = new InMemoryAttendanceRepository()));

  it('passes the same student on the same device', async () => {
    await repo.create(record());
    expect((await new DeviceBindingRule(repo).check(makeCtx())).kind).toBe('pass');
  });

  it('rejects another student on an already-used device', async () => {
    await repo.create(record({ studentNumber: '999999999' }));
    expect(await new DeviceBindingRule(repo).check(makeCtx())).toMatchObject({ kind: 'reject', code: 'DEVICE_IN_USE' });
  });

  it('rejects a missing device id', async () => {
    expect(await new DeviceBindingRule(repo).check(makeCtx({ deviceId: '' }))).toMatchObject({ code: 'DEVICE_MISSING' });
  });
});

describe('GeoMath', () => {
  it('is zero for identical points', () => {
    expect(GeoMath.distanceM(CLASSROOM, CLASSROOM)).toBe(0);
  });

  it('matches a known distance (Tel Aviv → Jerusalem ≈ 54 km) within 0.5%', () => {
    const d = GeoMath.distanceM({ lat: 32.0853, lng: 34.7818 }, { lat: 31.7683, lng: 35.2137 });
    expect(Math.abs(d - 54_000) / 54_000).toBeLessThan(0.05);
  });

  it('credits reported accuracy, capped at 100 m', () => {
    expect(GeoMath.isInside(CLASSROOM, 50, { ...north(CLASSROOM, 120), accuracyM: 80 }).inside).toBe(true);
    expect(GeoMath.isInside(CLASSROOM, 50, { ...north(CLASSROOM, 500), accuracyM: 5000 }).inside).toBe(false);
  });
});

describe('Geofence policies', () => {
  const far = makeCtx({ location: north(CLASSROOM, 300) });
  const near = makeCtx({ location: north(CLASSROOM, 20) });
  const unknown = makeCtx({ location: undefined });
  const noCenter = makeCtx({ session: makeSession({ location: undefined }), location: undefined });

  it('lenient: inside passes with distance, outside warns, unknown warns', async () => {
    const p = new LenientGeofencePolicy();
    expect(await p.check(near)).toMatchObject({ kind: 'pass', data: { distanceM: 20 } });
    expect(await p.check(far)).toMatchObject({ kind: 'warn', code: 'GEO_OUTSIDE', data: { distanceM: 300 } });
    expect(await p.check(unknown)).toMatchObject({ kind: 'warn', code: 'GEO_UNKNOWN' });
  });

  it('strict: inside passes, outside and unknown reject', async () => {
    const p = new StrictGeofencePolicy();
    expect((await p.check(near)).kind).toBe('pass');
    expect(await p.check(far)).toMatchObject({ kind: 'reject', code: 'GEO_OUTSIDE' });
    expect(await p.check(unknown)).toMatchObject({ kind: 'reject', code: 'GEO_UNKNOWN' });
  });

  it('both pass when the session has no location (geofence disabled)', async () => {
    expect((await new LenientGeofencePolicy().check(noCenter)).kind).toBe('pass');
    expect((await new StrictGeofencePolicy().check(noCenter)).kind).toBe('pass');
  });

  it('factory maps mode → class', () => {
    expect(GeofencePolicyFactory.for('strict')).toBeInstanceOf(StrictGeofencePolicy);
    expect(GeofencePolicyFactory.for('lenient')).toBeInstanceOf(LenientGeofencePolicy);
  });
});
