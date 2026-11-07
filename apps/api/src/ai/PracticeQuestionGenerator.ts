import { type Attachment, type LLMProvider, LLMOutputError } from './LLMProvider.js';

export const LECTURE_QUESTIONS = 8;
const MAX_LENGTH = 300;

const PROMPT = `You are helping a university lecturer prepare open review questions for students after the lecture.
The attached file is the full slide deck. Write exactly ${LECTURE_QUESTIONS} different open questions spread across its main topics, in the order they appear.
Each question is one or two sentences (max ${MAX_LENGTH} characters), asks the student to explain, compare or apply an idea rather than recall a definition, and has no answer options.
Write in the same language as the slides (Hebrew slides -> Hebrew questions).`;

const SCHEMA = {
  type: 'object',
  properties: { questions: { type: 'array', items: { type: 'string' } } },
  required: ['questions'],
};

/** Open review questions for a lecture page, drafted from the lecture's slide deck. */
export class PracticeQuestionGenerator {
  constructor(private readonly llm: LLMProvider) {}

  async fromLecture(deck: Attachment): Promise<string[]> {
    const raw = await this.llm.generateStructured<{ questions?: unknown }>({ task: 'generate_practice', prompt: PROMPT, schema: SCHEMA, files: [deck] });
    const questions = (Array.isArray(raw?.questions) ? raw.questions : [])
      .filter((q): q is string => typeof q === 'string')
      .map((q) => q.trim())
      .filter((q) => q && q.length <= MAX_LENGTH);
    if (questions.length === 0) throw new LLMOutputError('generate_practice: no valid questions');
    return [...new Set(questions)].slice(0, LECTURE_QUESTIONS);
  }
}
