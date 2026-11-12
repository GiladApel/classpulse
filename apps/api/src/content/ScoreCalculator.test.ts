import { describe, expect, it } from 'vitest';
import { ScoreCalculator } from './ScoreCalculator.js';
import type { GuideOutline, SectionMark } from './types.js';

const outline: GuideOutline = {
  questions: [
    { id: 'q1', title: 'Q1', sections: [{ id: 'q1.1', asked: '', requirements: [] }, { id: 'q1.2', asked: '', requirements: [] }] },
    { id: 'q2', title: 'Q2', sections: [{ id: 'q2.1', asked: '', requirements: [] }] },
  ],
};
const mark = (id: string, score: number, answered = true): SectionMark => ({ id, answered, score, meets: '', missing: '', direction: '' });

describe('ScoreCalculator', () => {
  it('an answered section is 1–100 (a 0 is lifted to 1); an unanswered or missing one is 0', () => {
    expect(ScoreCalculator.section(mark('a', 0))).toBe(1);
    expect(ScoreCalculator.section(mark('a', 140))).toBe(100);
    expect(ScoreCalculator.section(mark('a', 72.6))).toBe(73);
    expect(ScoreCalculator.section(mark('a', 90, false))).toBe(0);
    expect(ScoreCalculator.section(undefined)).toBe(0);
  });

  it('a question is the plain average of its sections; the total the plain average of the questions', () => {
    const marks = [mark('q1.1', 90), mark('q1.2', 75), mark('q2.1', 40)];
    expect(ScoreCalculator.questions(outline, marks)).toEqual([
      { id: 'q1', score: 83 },
      { id: 'q2', score: 40 },
    ]);
    // (82.5 + 40) / 2 = 61.25: the total averages the exact question scores, then rounds.
    expect(ScoreCalculator.total(outline, marks)).toBe(61);
  });

  it('the total never drops below 1, even when nothing was answered', () => {
    expect(ScoreCalculator.total(outline, [])).toBe(1);
    expect(ScoreCalculator.questions(outline, [mark('q2.1', 50, false)])).toEqual([
      { id: 'q1', score: 0 },
      { id: 'q2', score: 0 },
    ]);
  });

  it('places: highest first, equal scores share a place', () => {
    expect(ScoreCalculator.places([80, 90, 70, 80])).toEqual([2, 1, 4, 2]);
    expect(ScoreCalculator.places([])).toEqual([]);
  });
});
