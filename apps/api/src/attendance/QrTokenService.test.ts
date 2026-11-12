import { describe, expect, it } from 'vitest';
import { FixedClock } from '../infra/Clock.js';
import { T0 } from '../test/fixtures.js';
import { QrTokenService, TokenError } from './QrTokenService.js';

const setup = () => {
  const clock = new FixedClock(T0);
  return { clock, qr: new QrTokenService(clock, 10, 2) };
};

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as TokenError).code;
  }
  return 'NO_ERROR';
};

describe('QrTokenService', () => {
  it('round-trips issue → verify', () => {
    const { qr } = setup();
    const token = qr.issue('abc123', 's3cret');
    expect(qr.verify(token, 's3cret')).toEqual({ sessionId: 'abc123', window: qr.currentWindow() });
  });

  it('accepts the token in its own and the next window, rejects after', () => {
    const { qr, clock } = setup();
    const token = qr.issue('abc123', 's3cret');
    clock.advance(10_000);
    expect(() => qr.verify(token, 's3cret')).not.toThrow();
    clock.advance(10_000);
    expect(codeOf(() => qr.verify(token, 's3cret'))).toBe('TOKEN_EXPIRED');
  });

  it('rejects a tampered signature', () => {
    const { qr } = setup();
    const token = qr.issue('abc123', 's3cret');
    const last = token.at(-1) === 'A' ? 'B' : 'A';
    expect(codeOf(() => qr.verify(token.slice(0, -1) + last, 's3cret'))).toBe('TOKEN_INVALID');
  });

  it('rejects a token signed with another session secret', () => {
    const { qr } = setup();
    const token = qr.issue('abc123', 'other');
    expect(codeOf(() => qr.verify(token, 's3cret'))).toBe('TOKEN_INVALID');
  });

  it('rejects a token whose session id was swapped', () => {
    const { qr } = setup();
    const [, w, sig] = qr.issue('abc123', 's3cret').split('.');
    expect(codeOf(() => qr.verify(`zzz999.${w}.${sig}`, 's3cret'))).toBe('TOKEN_INVALID');
  });

  it('rejects tokens from the future', () => {
    const { qr, clock } = setup();
    clock.advance(30_000);
    const future = qr.issue('abc123', 's3cret');
    clock.advance(-30_000);
    expect(codeOf(() => qr.verify(future, 's3cret'))).toBe('TOKEN_INVALID');
  });

  it.each(['', 'garbage', 'a.b', 'ABC.1.xxxxxxxxxxxxxxxxxxxxxx', 'abc.1.short'])('rejects malformed token %j', (t) => {
    const { qr } = setup();
    expect(codeOf(() => qr.parse(t))).toBe('TOKEN_INVALID');
  });

  it('reports time until the next window', () => {
    const { qr, clock } = setup();
    clock.advance(3_500);
    expect(qr.msUntilNextWindow()).toBe(6_500);
  });
});
