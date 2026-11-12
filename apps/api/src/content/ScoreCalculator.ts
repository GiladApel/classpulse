import type { GuideOutline, QuestionScore, SectionMark } from './types.js';

/**
 * Homework scores are computed here, never by the model: a section is 1–100 when answered and 0 when not;
 * a question is the plain average of its sections; the total is the plain average of the questions, at least 1.
 */
export class ScoreCalculator {
  static section(mark: Pick<SectionMark, 'answered' | 'score'> | undefined): number {
    if (!mark?.answered) return 0;
    return Math.min(100, Math.max(1, Math.round(mark.score)));
  }

  static questions(outline: GuideOutline, marks: SectionMark[]): QuestionScore[] {
    return outline.questions.map((q) => ({ id: q.id, score: Math.round(ScoreCalculator.questionAverage(q, marks)) }));
  }

  static total(outline: GuideOutline, marks: SectionMark[]): number {
    const averages = outline.questions.map((q) => ScoreCalculator.questionAverage(q, marks));
    if (averages.length === 0) return 1;
    return Math.max(1, Math.round(averages.reduce((a, b) => a + b, 0) / averages.length));
  }

  /** Places for scores, highest first; equal scores share a place (90, 80, 80, 70 → 1, 2, 2, 4). */
  static places(scores: number[]): number[] {
    return scores.map((s) => 1 + scores.filter((o) => o > s).length);
  }

  private static questionAverage(q: GuideOutline['questions'][number], marks: SectionMark[]): number {
    if (q.sections.length === 0) return 0;
    const byId = new Map(marks.map((m) => [m.id, m]));
    return q.sections.reduce((sum, s) => sum + ScoreCalculator.section(byId.get(s.id)), 0) / q.sections.length;
  }
}
