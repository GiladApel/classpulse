import { describe, expect, it } from 'vitest';
import { HomeworkGuideGenerator, MAX_QUESTIONS } from './HomeworkGuideGenerator.js';
import { MockProvider } from './MockProvider.js';

const pdf = { mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4') };
const section = (asked: string) => ({ asked, requirements: ['r1', ' ', 'r2'], expected: 'הסוד', givingAway: 'התשובה הסופית' });

describe('HomeworkGuideGenerator', () => {
  it('assigns its own question and section ids, trims text and keeps the homework order', async () => {
    const llm = new MockProvider({
      generate_homework_guide: {
        questions: [
          { id: 'evil', title: ' שאלה ראשונה ', sections: [section('סעיף א'), section('סעיף ב')] },
          { title: '', sections: [section('יחיד')] },
        ],
        instructions: ' בדקו נימוק ',
      },
    });
    const guide = await new HomeworkGuideGenerator(llm).fromHomework(pdf);
    expect(llm.calls[0]).toMatchObject({ task: 'generate_homework_guide', files: [pdf] });
    expect(guide.questions.map((q) => [q.id, q.title, q.sections.map((s) => s.id)])).toEqual([
      ['q1', 'שאלה ראשונה', ['q1.1', 'q1.2']],
      ['q2', 'שאלה 2', ['q2.1']],
    ]);
    expect(guide.questions[0].sections[0]).toEqual({ id: 'q1.1', asked: 'סעיף א', requirements: ['r1', 'r2'], expected: 'הסוד', givingAway: 'התשובה הסופית' });
    expect(guide.instructions).toBe('בדקו נימוק');
  });

  it('drops questions without sections and sections without text, caps the count, and fails when nothing is left', () => {
    const many = Array.from({ length: MAX_QUESTIONS + 3 }, () => ({ title: 'q', sections: [section('s')] }));
    expect(HomeworkGuideGenerator.validate({ questions: [{ title: 'ריקה', sections: [{ asked: ' ' }] }, ...many] }).questions).toHaveLength(MAX_QUESTIONS);
    expect(() => HomeworkGuideGenerator.validate({ questions: [{ title: 'x', sections: [] }] })).toThrow('no questions');
    expect(() => HomeworkGuideGenerator.validate(null)).toThrow('no questions');
  });

  it('the outline has the questions and requirements but never the expected answers', () => {
    const guide = HomeworkGuideGenerator.validate({ questions: [{ title: 'Q', sections: [section('S')] }], instructions: '' });
    const outline = HomeworkGuideGenerator.outline(guide);
    expect(outline).toEqual({ questions: [{ id: 'q1', title: 'Q', sections: [{ id: 'q1.1', asked: 'S', requirements: ['r1', 'r2'] }] }] });
    expect(JSON.stringify(outline)).not.toContain('הסוד');
  });
});
