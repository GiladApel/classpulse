import { beforeEach, describe, expect, it } from 'vitest';
import { LLMOutputError } from '../ai/LLMProvider.js';
import { MockProvider } from '../ai/MockProvider.js';
import type { Session } from '../attendance/types.js';
import { makeCtx, T0 } from '../test/fixtures.js';
import { FakeImageProcessor, makeTestPorts } from '../test/testContainer.js';

// Mock detection (DEFAULT_FIXTURES): three people, boxes centred at x ≈ 0.19 / 0.50 / 0.81, y ≈ 0.55.
const SEAT = [{ x: 0.19, y: 0.55 }, { x: 0.5, y: 0.55 }, { x: 0.81, y: 0.55 }];
const EMPTY = { x: 0.5, y: 0.1 };
const photo = { mimeType: 'image/jpeg', data: Buffer.from('PHOTO') };

describe('ChallengeManager', () => {
  let t: ReturnType<typeof makeTestPorts>;
  let session: Session;

  const checkIn = async (n: string, name = n) => {
    const token = t.container.tokens.issue(session.id, session.qrSecret);
    return (await t.container.attendance.checkIn(makeCtx({ session, studentId: `u${n}`, studentNumber: n, studentName: name, deviceId: `d${n}`, token, now: t.clock.now() }))).record;
  };

  beforeEach(async () => {
    t = makeTestPorts();
    session = await t.container.sessions.start('lect1', { courseId: 'c1', title: 'L', geofenceMode: 'lenient', geofenceRadiusM: 50 });
  });

  describe('snapHeadcount', () => {
    it('detects, blurs, stores both photos and reports a mismatch beyond tolerance', async () => {
      for (const n of ['1', '2', '3', '4', '5']) await checkIn(n);
      const r = await t.container.challenges.snapHeadcount(session, photo);
      expect(r).toMatchObject({ presentCount: 5, mismatch: true, detectionFailed: false, headcount: { peopleCount: 3, checkinsAtSnap: 5 } });
      expect((t.ports.images as FakeImageProcessor).blurCalls).toEqual([30]);
      expect((await t.ports.headcountRepo.getBlurred(r.headcount.id)).toString()).toBe('BLUR:PHOTO');
    });

    it('no mismatch within tolerance (one extra check-in on 3 people)', async () => {
      for (const n of ['1', '2', '3', '4']) await checkIn(n);
      expect((await t.container.challenges.snapHeadcount(session, photo)).mismatch).toBe(false);
    });

    it('detection failure still stores the photo and lets roll-call run', async () => {
      t = makeTestPorts({ llm: new MockProvider({ detect_people: new LLMOutputError('boom') }) });
      session = await t.container.sessions.start('lect1', { courseId: 'c1', title: 'L', geofenceMode: 'lenient', geofenceRadiusM: 50 });
      const r = await t.container.challenges.snapHeadcount(session, photo);
      expect(r).toMatchObject({ detectionFailed: true, mismatch: false, headcount: { peopleCount: null } });
      await expect(t.container.challenges.launch(session, 'visual_ping', r.headcount.id)).rejects.toMatchObject({ code: 'HEADCOUNT_REQUIRED' });
      await expect(t.container.challenges.launch(session, 'rollcall')).resolves.toMatchObject({ status: 'active' });
    });
  });

  describe('visual ping end-to-end', () => {
    it('launch → taps → expiry → verdicts persisted and non-ok records flagged', async () => {
      const [a, b, c, d] = [await checkIn('1', 'a'), await checkIn('2', 'b'), await checkIn('3', 'c'), await checkIn('4', 'd')];
      const { headcount } = await t.container.challenges.snapHeadcount(session, photo);
      const ch = await t.container.challenges.launch(session, 'visual_ping', headcount.id);
      expect(ch).toMatchObject({ status: 'active', type: 'visual_ping' });
      expect((t.ports.challengeRepo as unknown as { images: Map<string, Buffer> }).images.get(ch.id)?.toString()).toBe('BLUR:PHOTO');

      const m = t.container.challenges;
      await m.submitResponse(ch.id, { id: 'u1', studentNumber: '1' }, { tap: SEAT[0] });
      await m.submitResponse(ch.id, { id: 'u2', studentNumber: '2' }, { tap: SEAT[1] });
      await m.submitResponse(ch.id, { id: 'u3', studentNumber: '3' }, { tap: EMPTY });
      // d never answers

      expect(await m.closeExpired()).toBe(0); // still running
      t.clock.advance(46_000);
      expect(await m.closeExpired()).toBe(1);

      const responses = await t.ports.responseRepo.listByChallenge(ch.id);
      expect(Object.fromEntries(responses.map((r) => [r.studentNumber, r.verdict]))).toEqual({ 1: 'ok', 2: 'ok', 3: 'empty_seat', 4: 'no_response' });

      const status = async (id: string) => (await t.container.attendance.get(id)).status;
      expect([await status(a.id), await status(b.id), await status(c.id), await status(d.id)]).toEqual(['present', 'present', 'flagged', 'flagged']);
      expect((await t.container.attendance.get(c.id)).note).toMatch(/מקום ריק/);
      expect((await t.ports.challengeRepo.get(ch.id))?.status).toBe('closed');
    });

    it('rejects a second tap, late taps, and students who were not checked in when it started', async () => {
      await checkIn('1');
      const { headcount } = await t.container.challenges.snapHeadcount(session, photo);
      const ch = await t.container.challenges.launch(session, 'visual_ping', headcount.id);
      t.clock.advance(1_000);
      const late = await checkIn('9');
      const m = t.container.challenges;

      await m.submitResponse(ch.id, { id: 'u1', studentNumber: '1' }, { tap: SEAT[0] });
      await expect(m.submitResponse(ch.id, { id: 'u1', studentNumber: '1' }, { tap: SEAT[1] })).rejects.toMatchObject({ code: 'ALREADY_ANSWERED' });
      await expect(m.submitResponse(ch.id, { id: 'u9', studentNumber: late.studentNumber }, { tap: SEAT[1] })).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
      t.clock.advance(46_000);
      await expect(m.submitResponse(ch.id, { id: 'u1', studentNumber: '1' }, { tap: SEAT[0] })).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' });
    });

    it('only one active challenge per session; a headcount from another session is rejected', async () => {
      const { headcount } = await t.container.challenges.snapHeadcount(session, photo);
      await t.container.challenges.launch(session, 'rollcall');
      await expect(t.container.challenges.launch(session, 'visual_ping', headcount.id)).rejects.toMatchObject({ code: 'CHALLENGE_ACTIVE' });

      const other = await t.container.sessions.start('lect1', { courseId: 'c1', title: 'Other', geofenceMode: 'lenient', geofenceRadiusM: 50 });
      await expect(t.container.challenges.launch(other, 'visual_ping', headcount.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('lecturer can close early (force)', async () => {
      await checkIn('1');
      const ch = await t.container.challenges.launch(session, 'rollcall');
      const verdicts = await t.container.challenges.close(ch.id, true);
      expect(Object.fromEntries(verdicts)).toEqual({ 1: 'no_response' });
    });
  });

  describe('roll-call', () => {
    it('issues rotating tokens; scanners are ok, others flagged', async () => {
      const a = await checkIn('1');
      const b = await checkIn('2');
      const ch = await t.container.challenges.launch(session, 'rollcall');
      const { token, refreshInMs } = t.container.challenges.rollcallToken(ch);
      expect(refreshInMs).toBeGreaterThan(0);

      await t.container.challenges.submitResponse(ch.id, { id: 'u1', studentNumber: '1' }, { token });
      await expect(
        t.container.challenges.submitResponse(ch.id, { id: 'u2', studentNumber: '2' }, { token: t.container.tokens.issue(session.id, session.qrSecret) }),
      ).rejects.toMatchObject({ code: 'TOKEN_INVALID' });

      t.clock.advance(31_000);
      await t.container.challenges.closeExpired();
      expect((await t.container.attendance.get(a.id)).status).toBe('present');
      expect((await t.container.attendance.get(b.id)).status).toBe('flagged');
    });
  });

  it('lecturer confirm restores a flagged record; flag never resurrects a removed one', async () => {
    const a = await checkIn('1');
    await t.container.attendance.flag(a.id, 'x');
    expect((await t.container.attendance.confirm(a.id)).status).toBe('present');
    await t.container.attendance.remove(a.id, 'gone');
    expect((await t.container.attendance.flag(a.id, 'y')).status).toBe('removed');
    expect(await t.container.attendance.presentCount(session.id)).toBe(0);
  });

  it('T0 sanity: fixtures use a fixed clock', () => {
    expect(t.clock.now()).toEqual(T0);
  });
});
