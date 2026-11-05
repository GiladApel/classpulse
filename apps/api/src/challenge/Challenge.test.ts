import { describe, expect, it } from 'vitest';
import { QrTokenService } from '../attendance/QrTokenService.js';
import { FixedClock } from '../infra/Clock.js';
import { T0 } from '../test/fixtures.js';
import type { AcceptContext } from './Challenge.js';
import { ChallengeFactory } from './ChallengeFactory.js';
import { RollCallChallenge } from './RollCallChallenge.js';
import type { ChallengeData, Headcount } from './types.js';
import { VisualPingChallenge } from './VisualPingChallenge.js';

const clock = new FixedClock(T0);
const tokens = new QrTokenService(clock);
const later = (s: number) => new Date(T0.getTime() + s * 1000);

const data = (over: Partial<ChallengeData> = {}): ChallengeData => ({
  id: 'ch1',
  sessionId: 's1',
  type: 'visual_ping',
  status: 'pending',
  startedAt: T0,
  expiresAt: T0,
  secret: 'roll-secret',
  ...over,
});

const headcount: Headcount = {
  id: 'hc1',
  sessionId: 's1',
  peopleCount: 2,
  confidence: 0.9,
  boxes: [
    { x: 0.1, y: 0.4, w: 0.2, h: 0.3 },
    { x: 0.6, y: 0.4, w: 0.2, h: 0.3 },
  ],
  checkinsAtSnap: 3,
  createdAt: T0,
};

const ctx = (over: Partial<AcceptContext> = {}): AcceptContext => ({
  eligible: new Set(['a', 'b', 'c']),
  alreadyAnswered: false,
  now: later(5),
  ...over,
});

const code = (fn: () => unknown) => {
  try {
    fn();
    return 'OK';
  } catch (e) {
    return (e as { code: string }).code;
  }
};

describe('ChallengeFactory', () => {
  it('maps type → class', () => {
    expect(ChallengeFactory.create(data({ type: 'rollcall' }), { tokens })).toBeInstanceOf(RollCallChallenge);
    expect(ChallengeFactory.create(data(), { tokens, headcount })).toBeInstanceOf(VisualPingChallenge);
  });

  it('visual_ping without a usable headcount → HEADCOUNT_REQUIRED', () => {
    expect(code(() => ChallengeFactory.create(data(), { tokens }))).toBe('HEADCOUNT_REQUIRED');
    expect(code(() => ChallengeFactory.create(data(), { tokens, headcount: { ...headcount, peopleCount: null } }))).toBe('HEADCOUNT_REQUIRED');
  });
});

describe('Challenge lifecycle (State + Template Method)', () => {
  const started = () => {
    const c = ChallengeFactory.create(data(), { tokens, headcount });
    c.start(T0, 45);
    return c;
  };

  it('start: pending → active with expiry; cannot start twice', () => {
    const c = started();
    expect(c.state).toMatchObject({ status: 'active', expiresAt: later(45) });
    expect(code(() => c.start(T0, 45))).toBe('CHALLENGE_STATE');
  });

  it('accept guards: expired, not eligible, already answered, invalid tap', () => {
    const c = started();
    const tap = { x: 0.2, y: 0.5 };
    expect(code(() => c.accept({ studentNumber: 'a', payload: { tap } }, ctx()))).toBe('OK');
    expect(code(() => c.accept({ studentNumber: 'a', payload: { tap } }, ctx({ now: later(45) })))).toBe('CHALLENGE_EXPIRED');
    expect(code(() => c.accept({ studentNumber: 'zz', payload: { tap } }, ctx()))).toBe('NOT_ELIGIBLE');
    expect(code(() => c.accept({ studentNumber: 'a', payload: { tap } }, ctx({ alreadyAnswered: true })))).toBe('ALREADY_ANSWERED');
    expect(code(() => c.accept({ studentNumber: 'a', payload: { tap: { x: 2, y: 0.5 } } }, ctx()))).toBe('TAP_INVALID');
    expect(code(() => c.accept({ studentNumber: 'a', payload: {} }, ctx()))).toBe('TAP_INVALID');
  });

  it('cannot respond before start', () => {
    const c = ChallengeFactory.create(data(), { tokens, headcount });
    expect(code(() => c.accept({ studentNumber: 'a', payload: { tap: { x: 0.2, y: 0.5 } } }, ctx()))).toBe('CHALLENGE_STATE');
  });

  it('close: refuses while running unless forced; then active → closed', () => {
    const c = started();
    expect(code(() => c.close([], ['a'], later(10)))).toBe('CHALLENGE_RUNNING');
    c.close([], ['a'], later(10), true);
    expect(c.state.status).toBe('closed');
    expect(code(() => c.close([], ['a'], later(60)))).toBe('CHALLENGE_STATE');
  });

  it('visual ping verdicts: ok, empty_seat, collision, no_response', () => {
    const c = started();
    const verdicts = c.close(
      [
        { studentNumber: 'a', payload: { tap: { x: 0.15, y: 0.5 } } },
        { studentNumber: 'b', payload: { tap: { x: 0.25, y: 0.5 } } },
        { studentNumber: 'c', payload: { tap: { x: 0.45, y: 0.1 } } },
      ],
      ['a', 'b', 'c', 'd'],
      later(45),
    );
    expect(Object.fromEntries(verdicts)).toEqual({ a: 'collision', b: 'collision', c: 'empty_seat', d: 'no_response' });
  });
});

describe('RollCallChallenge', () => {
  const started = () => {
    const c = ChallengeFactory.create(data({ type: 'rollcall' }), { tokens }) as RollCallChallenge;
    c.start(T0, 30);
    return c;
  };

  it('accepts its own fresh token, rejects others', () => {
    const c = started();
    expect(code(() => c.accept({ studentNumber: 'a', payload: { token: c.currentToken() } }, ctx()))).toBe('OK');
    expect(code(() => c.accept({ studentNumber: 'a', payload: { token: tokens.issue('ch1', 'other-secret') } }, ctx()))).toBe('TOKEN_INVALID');
    expect(code(() => c.accept({ studentNumber: 'a', payload: { token: tokens.issue('other', 'roll-secret') } }, ctx()))).toBe('TOKEN_INVALID');
    expect(code(() => c.accept({ studentNumber: 'a', payload: {} }, ctx()))).toBe('TOKEN_INVALID');
  });

  it('responders → ok, the rest → no_response', () => {
    const c = started();
    const verdicts = c.close([{ studentNumber: 'a', payload: {} }], ['a', 'b'], later(30));
    expect(Object.fromEntries(verdicts)).toEqual({ a: 'ok', b: 'no_response' });
  });
});
