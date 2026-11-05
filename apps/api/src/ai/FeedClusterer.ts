import type { FeedPost, Theme } from '../engagement/types.js';
import { type LLMProvider, LLMOutputError } from './LLMProvider.js';

const PROMPT = `These are students' questions and comments from a live lecture, one per line as "<id>: <text>".
Group them into at most 5 themes so the lecturer can answer several at once.
For each theme give a short "title", a one-sentence "summary" of what students are asking, and the "postIds" it covers.
Every id must come from the list. Write in the same language as the posts.`;

const SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          postIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'summary', 'postIds'],
      },
    },
  },
  required: ['themes'],
};

interface Raw {
  themes?: { title?: unknown; summary?: unknown; postIds?: unknown }[];
}

export class FeedClusterer {
  constructor(private readonly llm: LLMProvider) {}

  async cluster(posts: FeedPost[]): Promise<Theme[]> {
    const lines = posts.map((p) => `${p.id}: ${p.text.replace(/\s+/g, ' ')}`).join('\n');
    const raw = await this.llm.generateStructured<Raw>({ task: 'cluster_feed', prompt: `${PROMPT}\n\n${lines}`, schema: SCHEMA });
    if (!raw || !Array.isArray(raw.themes)) throw new LLMOutputError('cluster_feed: missing themes[]');
    // The model may invent ids or repeat a post across themes; keep known ids, first theme wins.
    const unassigned = new Set(posts.map((p) => p.id));
    const themes: Theme[] = [];
    for (const t of raw.themes) {
      if (typeof t.title !== 'string' || !t.title.trim() || !Array.isArray(t.postIds)) continue;
      const postIds = t.postIds.filter((id): id is string => typeof id === 'string' && unassigned.delete(id));
      if (postIds.length) themes.push({ title: t.title.trim(), summary: typeof t.summary === 'string' ? t.summary.trim() : '', postIds });
    }
    return themes;
  }
}
