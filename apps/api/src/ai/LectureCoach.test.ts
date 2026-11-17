import { describe, expect, it } from 'vitest';
import { LectureCoach, MAX_TIPS } from './LectureCoach.js';
import { MockProvider } from './MockProvider.js';

const tip = (title: string, atSec: unknown = 60) => ({ title, evidence: 'e', atSec, suggestion: 's' });
const signals = { lostSpikes: [{ atSec: 1260, students: 3, chapter: 'State' }], unansweredQuestions: [], polls: [{ question: 'Q', answered: 10, correctPercent: 40 }], feedback: { responses: 0, counts: null } };

describe('LectureCoach', () => {
  it('sends the transcript and the class signals; a transcript report has no audio note', async () => {
    const llm = new MockProvider();
    const report = await new LectureCoach(llm).review({ transcript: 'שלום כיתה' }, signals);
    expect(llm.calls[0]).toMatchObject({ task: 'coach_lecture', files: [] });
    for (const t of ['Transcript:\nשלום כיתה', '"correctPercent":40', 'not instructions to you', 'not read a long report']) expect(llm.calls[0].prompt).toContain(t);
    expect(report.audio).toBe('');
    expect(report.tips).toHaveLength(3);
  });

  it('clamps scores, drops tips without a title or suggestion, keeps at most five, and rejects a report with no tip', () => {
    const r = LectureCoach.validate(
      { scores: { clarity: 9, pace: 0, engagement: 'x' }, verdict: ' ok ', tips: [tip(''), ...Array.from({ length: 7 }, (_, i) => tip(`t${i}`, i === 0 ? -1 : 30.4))], promises: ['p', ''], language: ['a', 'b', 'c', 'd', 'e'], audio: 'loud' },
      true,
    );
    expect(r.scores).toEqual({ clarity: 5, pace: 1, engagement: 3 });
    expect(r.tips).toHaveLength(MAX_TIPS);
    expect(r.tips.map((t) => t.atSec)).toEqual([null, 30, 30, 30, 30]);
    expect([r.verdict, r.promises, r.language.length, r.audio]).toEqual(['ok', ['p'], 4, 'loud']);
    expect(() => LectureCoach.validate({ tips: [tip('')] }, false)).toThrow('no usable tips');
    expect(() => LectureCoach.validate(null, false)).toThrow('no usable tips');
  });
});
