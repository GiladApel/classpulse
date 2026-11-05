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
};
