import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../infra/Clock.js';
import { InMemoryHeadcountRepository } from '../infra/memory/InMemoryChallengeRepositories.js';
import { InMemoryCourseRepository } from '../infra/memory/InMemoryCourseRepository.js';
import { InMemorySessionRepository } from '../infra/memory/InMemorySessionRepository.js';
import { CLASSROOM, T0 } from '../test/fixtures.js';
import { QrTokenService } from './QrTokenService.js';
import { SessionService } from './SessionService.js';

describe('SessionService', () => {
  let clock: FixedClock;
  let tokens: QrTokenService;
  let svc: SessionService;
  let headcounts: InMemoryHeadcountRepository;
  const input = { courseId: 'c1', title: 'הרצאה 5', location: CLASSROOM, geofenceMode: 'lenient' as const, geofenceRadiusM: 50 };

  beforeEach(() => {
    clock = new FixedClock(T0);
    tokens = new QrTokenService(clock);
    const courses = new InMemoryCourseRepository([{ id: 'c1', code: 'I2SE', name: 'הנדסת תוכנה', lecturerId: 'lect1' }]);
    headcounts = new InMemoryHeadcountRepository();
    svc = new SessionService(new InMemorySessionRepository(), courses, tokens, clock, headcounts);
  });

  it('end purges the clear class photos but keeps the blurred ones', async () => {
    const s = await svc.start('lect1', input);
    const hc = await headcounts.create(
      { sessionId: s.id, peopleCount: 3, confidence: 1, boxes: [], checkinsAtSnap: 3, createdAt: T0 },
      { photo: Buffer.from('clear'), blurred: Buffer.from('blur') },
    );
    await svc.end(s);
    expect(headcounts.items.get(hc.id)?.photo).toBeNull();
    expect(await headcounts.getBlurred(hc.id)).toEqual(Buffer.from('blur'));
  });

  it('start creates an active session with location and a fresh secret', async () => {
    const a = await svc.start('lect1', input);
    const b = await svc.start('lect1', input);
    expect(a).toMatchObject({ status: 'active', startedAt: T0, location: CLASSROOM, lecturerId: 'lect1' });
    expect(a.qrSecret).toHaveLength(43);
    expect(a.qrSecret).not.toBe(b.qrSecret);
  });

  it("an empty title becomes 'הרצאה N', numbered by the course's lessons", async () => {
    expect((await svc.start('lect1', { ...input, title: '  ' })).title).toBe('הרצאה 1');
    await svc.start('lect1', input);
    expect((await svc.start('lect1', { ...input, title: '' })).title).toBe('הרצאה 3');
  });

  it('start refuses another lecturer’s course and unknown courses', async () => {
    await expect(svc.start('intruder', input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.start('lect1', { ...input, courseId: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('issues verifiable QR tokens while active and refuses after end', async () => {
    const s = await svc.start('lect1', input);
    const { token, refreshInMs } = svc.currentQrToken(s);
    expect(tokens.verify(token, s.qrSecret).sessionId).toBe(s.id);
    expect(refreshInMs).toBeGreaterThan(0);

    clock.advance(60_000);
    const ended = await svc.end(s);
    expect(ended).toMatchObject({ status: 'ended', endedAt: clock.now() });
    expect(() => svc.currentQrToken(ended)).toThrow(/ended/);
  });

  it('getOwned enforces ownership', async () => {
    const s = await svc.start('lect1', input);
    await expect(svc.getOwned(s.id, 'lect1')).resolves.toMatchObject({ id: s.id });
    await expect(svc.getOwned(s.id, 'other')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
