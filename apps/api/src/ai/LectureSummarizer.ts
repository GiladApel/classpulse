import type { Chapter, LectureSummary } from '../content/types.js';
import { type Attachment, type LLMProvider, LLMOutputError } from './LLMProvider.js';

export type LectureSource = { media: Attachment } | { transcript: string };

const PROMPT = `You are a teaching assistant summarizing a university lecture for students who want to review it.
Return:
- "tldr": 2-4 sentences on what the lecture covered.
- "chapters": the lecture's sections in order. "startSec" is when the section starts, in whole seconds from the start of the recording (for a transcript, use its timestamps). 4-12 chapters, each with a short "title" and a one-sentence "summary".
- "concepts": 3-8 key terms with a one-sentence "explanation" each.
- "questions": exactly 5 review questions with short model "answer"s, testing understanding, not trivia.
Write in the language the lecturer speaks (Hebrew lecture -> Hebrew output; keep technical terms as used in the lecture).`;

const SCHEMA = {
  type: 'object',
  properties: {
    tldr: { type: 'string' },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: { startSec: { type: 'integer', minimum: 0 }, title: { type: 'string' }, summary: { type: 'string' } },
        required: ['startSec', 'title', 'summary'],
      },
    },
    concepts: {
      type: 'array',
      items: { type: 'object', properties: { term: { type: 'string' }, explanation: { type: 'string' } }, required: ['term', 'explanation'] },
    },
    questions: {
      type: 'array',
      items: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } }, required: ['question', 'answer'] },
    },
  },
  required: ['tldr', 'chapters', 'concepts', 'questions'],
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export class LectureSummarizer {
  constructor(private readonly llm: LLMProvider) {}

  async summarize(source: LectureSource): Promise<LectureSummary> {
    const prompt = 'transcript' in source ? `${PROMPT}\n\nTranscript:\n${source.transcript}` : PROMPT;
    const files = 'media' in source ? [source.media] : [];
    const raw = await this.llm.generateStructured<Record<string, unknown>>({ task: 'summarize_lecture', prompt, schema: SCHEMA, files });
    return LectureSummarizer.validate(raw);
  }

  /** Drops malformed items, sorts chapters by time and removes duplicate start times. */
  static validate(raw: Record<string, unknown> | null): LectureSummary {
    const tldr = str(raw?.tldr);
    if (!tldr) throw new LLMOutputError('summarize_lecture: empty tldr');
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);

    const chapters: Chapter[] = [];
    for (const c of list(raw?.chapters)) {
      const startSec = typeof c.startSec === 'number' && Number.isFinite(c.startSec) && c.startSec >= 0 ? Math.round(c.startSec) : null;
      if (startSec === null || !str(c.title) || chapters.some((x) => x.startSec === startSec)) continue;
      chapters.push({ startSec, title: str(c.title), summary: str(c.summary) });
    }
    chapters.sort((a, b) => a.startSec - b.startSec);

    const concepts = list(raw?.concepts).map((c) => ({ term: str(c.term), explanation: str(c.explanation) })).filter((c) => c.term && c.explanation);
    const questions = list(raw?.questions).map((q) => ({ question: str(q.question), answer: str(q.answer) })).filter((q) => q.question).slice(0, 5);
    if (chapters.length === 0) throw new LLMOutputError('summarize_lecture: no valid chapters');
    return { tldr, chapters, concepts, questions };
  }
}
