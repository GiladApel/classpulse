import { type LLMProvider, LLMOutputError, type StructuredRequest } from './LLMProvider.js';

/** Deterministic provider for tests, offline development and the demo fallback. */
export class MockProvider implements LLMProvider {
  readonly calls: StructuredRequest[] = [];

  constructor(private readonly fixtures: Record<string, unknown> = DEFAULT_FIXTURES) {}

  async generateStructured<T>(req: StructuredRequest): Promise<T> {
    this.calls.push(req);
    if (!(req.task in this.fixtures)) throw new LLMOutputError(`No mock fixture for task ${req.task}`);
    const fixture = this.fixtures[req.task];
    if (fixture instanceof Error) throw fixture;
    return structuredClone(fixture) as T;
  }
}

// Three people in a row across the middle of the frame (box_2d = [ymin, xmin, ymax, xmax] on a 0–1000 grid).
export const DEFAULT_FIXTURES: Record<string, unknown> = {
  detect_people: {
    people: [
      { box_2d: [350, 100, 750, 280] },
      { box_2d: [350, 410, 750, 590] },
      { box_2d: [350, 720, 750, 900] },
    ],
    confidence: 0.9,
  },
  generate_mcq: {
    questions: [
      { question: 'איזה תבנית עיצוב מפרידה בין יצירת אובייקט לשימוש בו?', options: ['Factory', 'Observer', 'Adapter', 'Singleton'], correctIndex: 0 },
      { question: 'מה מבטיח עקרון ה-LSP?', options: ['מחלקה אחת לכל אחריות', 'תת-מחלקה יכולה להחליף את מחלקת הבסיס', 'תלות בממשקים', 'ממשקים קטנים'], correctIndex: 1 },
      { question: 'מתי נעדיף Strategy על פני if/else?', options: ['אף פעם', 'כשיש אלגוריתם אחד', 'כשאלגוריתמים מתחלפים בזמן ריצה', 'רק בבדיקות'], correctIndex: 2 },
    ],
  },
  // Ids are placeholders: FeedClusterer drops unknown ids, so tests pass their own fixture.
  cluster_feed: { themes: [] },
};
