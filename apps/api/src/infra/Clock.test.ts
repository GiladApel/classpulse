import { describe, expect, it } from 'vitest';
import { FixedClock } from './Clock.js';

describe('FixedClock', () => {
  it('advances deterministically', () => {
    const clock = new FixedClock(new Date('2026-11-05T10:00:00Z'));
    clock.advance(10_000);
    expect(clock.now().toISOString()).toBe('2026-11-05T10:00:10.000Z');
  });
});
