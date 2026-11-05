import { describe, expect, it } from 'vitest';
import { SeatHitTester } from './SeatHitTester.js';
import type { Box, Point } from './types.js';

const LEFT: Box = { x: 0.1, y: 0.4, w: 0.2, h: 0.3 };
const RIGHT: Box = { x: 0.6, y: 0.4, w: 0.2, h: 0.3 };
const classify = (taps: Record<string, Point>, boxes: Box[], padding = 0.03) =>
  Object.fromEntries(new SeatHitTester(padding).classify(new Map(Object.entries(taps)), boxes));

describe('SeatHitTester', () => {
  it('tap inside a box → ok', () => {
    expect(classify({ a: { x: 0.2, y: 0.5 } }, [LEFT, RIGHT])).toEqual({ a: 'ok' });
  });

  it('tap outside every box → empty_seat', () => {
    expect(classify({ a: { x: 0.45, y: 0.1 } }, [LEFT, RIGHT])).toEqual({ a: 'empty_seat' });
  });

  it('two taps in the same box → both collision; a third elsewhere stays ok', () => {
    expect(classify({ a: { x: 0.15, y: 0.5 }, b: { x: 0.25, y: 0.6 }, c: { x: 0.7, y: 0.5 } }, [LEFT, RIGHT])).toEqual({
      a: 'collision',
      b: 'collision',
      c: 'ok',
    });
  });

  it('tap just outside the edge but within padding → ok; beyond padding → empty_seat', () => {
    expect(classify({ a: { x: 0.32, y: 0.5 } }, [LEFT])).toEqual({ a: 'ok' });
    expect(classify({ a: { x: 0.35, y: 0.5 } }, [LEFT])).toEqual({ a: 'empty_seat' });
  });

  it('overlapping boxes → nearest centre wins, so neighbours do not collide', () => {
    const a: Box = { x: 0.1, y: 0.4, w: 0.3, h: 0.3 };
    const b: Box = { x: 0.3, y: 0.4, w: 0.3, h: 0.3 };
    expect(classify({ left: { x: 0.2, y: 0.55 }, right: { x: 0.5, y: 0.55 } }, [a, b])).toEqual({ left: 'ok', right: 'ok' });
  });

  it('no boxes → every tap is empty_seat', () => {
    expect(classify({ a: { x: 0.5, y: 0.5 } }, [])).toEqual({ a: 'empty_seat' });
  });
});
