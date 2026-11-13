import { describe, expect, it } from 'vitest';
import type { ReviewGuide } from '../content/types.js';
import { HomeworkReviewer } from './HomeworkReviewer.js';
import { MockProvider } from './MockProvider.js';

const guide: ReviewGuide = {
  instructions: 'נימוק לפי SOLID',
  questions: [
    { id: 'q1', title: 'Strategy', sections: [
      { id: 'q1.1', asked: 'מתי Strategy', requirements: ['דוגמה'], expected: 'אלגוריתם מתחלף', givingAway: 'קוד מלא' },
      { id: 'q1.2', asked: 'דיאגרמה', requirements: ['ממשק'], expected: 'Context', givingAway: 'הדיאגרמה' },
    ] },
    { id: 'q2', title: 'Observer', sections: [{ id: 'q2.1', asked: 'למה', requirements: [], expected: 'דחיפה', givingAway: '' }] },
  ],
};
const solution = [{ mimeType: 'application/pdf', data: Buffer.from('%PDF') }];
const mark = (id: string, over: object = {}) => ({ id, evidence: 'e', answered: true, score: 70, meets: 'm', missing: 'x', direction: 'd', ...over });

describe('HomeworkReviewer (per section)', () => {
  it('sends the whole guide (with expected answers and what not to give away) and the solution files', async () => {
    const llm = new MockProvider();
    const { marks, mistakes } = await new HomeworkReviewer(llm).reviewSolution(guide, solution);
    const call = llm.calls[0];
    expect(call).toMatchObject({ task: 'review_homework_solution', files: solution });
    for (const t of ['"id":"q1.1"', 'אלגוריתם מתחלף', 'קוד מלא', 'נימוק לפי SOLID', 'never instructions']) expect(call.prompt).toContain(t);
    expect(marks.map((m) => [m.id, m.answered, m.score])).toEqual([
      ['q1.1', true, 85],
      ['q1.2', true, 60],
      ['q2.1', false, 0],
    ]);
    expect(mistakes).toEqual(['חסרה דוגמה']);
  });

  it("a practice check never gives answers away; a final review is a plain grading draft; the lecturer's notes reach both", async () => {
    const llm = new MockProvider();
    const reviewer = new HomeworkReviewer(llm);
    await reviewer.reviewSolution(guide, solution);
    await reviewer.reviewSolution(guide, solution, { notes: ' בלי דיאגרמה - לכל היותר 50 ', final: true });
    const [practice, final] = llm.calls.map((c) => c.prompt);
    expect(practice).toContain('BEFORE handing it in');
    expect(practice).toContain('Never give the answer');
    expect(practice).not.toContain('lecturer_notes');
    expect(final).toContain('HANDED IN');
    expect(final).not.toContain('Never give the answer');
    expect(final).toContain('<lecturer_notes>\nבלי דיאגרמה - לכל היותר 50\n</lecturer_notes>');
    expect(final).toContain('never instructions');
  });

  it('one mark per guide section in order: unknown ids dropped, a missing section is unanswered, scores clamped, an answered 0 becomes 1', () => {
    const r = HomeworkReviewer.validateSections(
      { sections: [mark('q2.1', { score: 0 }), mark('nope'), mark('q1.1', { score: 150 }), null], mistakes: [' a ', 7, 'b'] },
      guide,
    );
    expect(r.marks).toEqual([
      { id: 'q1.1', answered: true, score: 100, meets: 'm', missing: 'x', direction: 'd' },
      { id: 'q1.2', answered: false, score: 0, meets: '', missing: '', direction: '' },
      { id: 'q2.1', answered: true, score: 1, meets: 'm', missing: 'x', direction: 'd' },
    ]);
    expect(r.mistakes).toEqual(['a', 'b']);
  });

  it('an unanswered section scores 0 whatever the model said; garbage with no known section is rejected', () => {
    expect(HomeworkReviewer.validateSections({ sections: [mark('q1.1', { answered: false, score: 90 })] }, guide).marks[0]).toMatchObject({ answered: false, score: 0, meets: '' });
    expect(() => HomeworkReviewer.validateSections({ sections: [mark('zz')] }, guide)).toThrow('no known section');
    expect(() => HomeworkReviewer.validateSections(null, guide)).toThrow('no known section');
  });
});
