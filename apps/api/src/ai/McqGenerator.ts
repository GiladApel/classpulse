import type { McqDraft } from '../engagement/types.js';
import { type Attachment, type LLMProvider, LLMOutputError } from './LLMProvider.js';

const RULES = `Each question has 4 short options (max 80 characters each) and exactly one correct option ("correctIndex", 0-based).
Prefer conceptual questions over trivia. Distractors must be plausible misconceptions.
Write in the same language as the slides (Hebrew slides -> Hebrew questions).`;

const SLIDE_PROMPT = `You are helping a university lecturer run a quick in-class poll.
From the attached lecture slide, write exactly 3 different multiple-choice questions that check understanding of its key idea.
${RULES}`;

export const LECTURE_QUESTIONS = 8;
const LECTURE_PROMPT = `You are helping a university lecturer prepare practice questions for after the lecture.
The attached file is the full slide deck. Write exactly ${LECTURE_QUESTIONS} different multiple-choice questions spread across its main topics, in the order they appear.
${RULES}`;

const SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
        },
        required: ['question', 'options', 'correctIndex'],
      },
    },
  },
  required: ['questions'],
};

interface RawQuestion {
  question?: unknown;
  options?: unknown;
  correctIndex?: unknown;
}

export class McqGenerator {
  constructor(private readonly llm: LLMProvider) {}

  /** 3 poll drafts from one slide image. */
  fromSlide(slide: Attachment): Promise<McqDraft[]> {
    return this.generate('generate_mcq', SLIDE_PROMPT, slide, 3);
  }

  /** Practice-question drafts from a whole deck (PDF or image). */
  fromLecture(deck: Attachment): Promise<McqDraft[]> {
    return this.generate('generate_practice', LECTURE_PROMPT, deck, LECTURE_QUESTIONS);
  }

  private async generate(task: string, prompt: string, file: Attachment, max: number): Promise<McqDraft[]> {
    const raw = await this.llm.generateStructured<{ questions?: RawQuestion[] }>({ task, prompt, schema: SCHEMA, files: [file] });
    const drafts = (Array.isArray(raw?.questions) ? raw.questions : []).map(McqGenerator.toDraft).filter((d): d is McqDraft => d !== null);
    if (drafts.length === 0) throw new LLMOutputError(`${task}: no valid questions`);
    return drafts.slice(0, max);
  }

  static toDraft(q: RawQuestion | null): McqDraft | null {
    if (!q || typeof q !== 'object') return null;
    const question = typeof q.question === 'string' ? q.question.trim() : '';
    const options = Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string').map((o) => o.trim()) : [];
    const idx = q.correctIndex;
    if (!question || options.length < 2 || options.some((o) => !o)) return null;
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= options.length) return null;
    return { question, options, correctIndex: idx };
  }
}
