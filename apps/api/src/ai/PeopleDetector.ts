import type { Box } from '../challenge/types.js';
import { type Attachment, type LLMProvider, LLMOutputError } from './LLMProvider.js';

export interface Detection {
  count: number;
  confidence: number;
  boxes: Box[];
}

const PROMPT = `You are counting people in a classroom photo for an attendance check.
Detect every person who is physically present (seated or standing), including partially visible people at the edges and back rows.
Do NOT count people shown on screens, projections, posters or reflections.
Return one entry per person with "box_2d" = [ymin, xmin, ymax, xmax] normalized to 0-1000, covering the person's visible head and upper body.
Also return "confidence" between 0 and 1 for how reliable the total count is (lower it for blur, darkness, crowding or occlusion).
Do not identify anyone.`;

const SCHEMA = {
  type: 'object',
  properties: {
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: { box_2d: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 } },
        required: ['box_2d'],
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['people', 'confidence'],
};

interface Raw {
  people?: { box_2d?: unknown }[];
  confidence?: unknown;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class PeopleDetector {
  constructor(private readonly llm: LLMProvider) {}

  async detect(photo: Attachment): Promise<Detection> {
    const raw = await this.llm.generateStructured<Raw>({ task: 'detect_people', prompt: PROMPT, schema: SCHEMA, files: [photo] });
    if (!raw || !Array.isArray(raw.people) || typeof raw.confidence !== 'number') {
      throw new LLMOutputError('detect_people: missing people[] or confidence');
    }
    const boxes = raw.people.map((p) => PeopleDetector.toBox(p.box_2d)).filter((b): b is Box => b !== null);
    return { count: boxes.length, confidence: clamp01(raw.confidence), boxes };
  }

  /** [ymin, xmin, ymax, xmax] on 0–1000 → {x, y, w, h} on 0–1, clamped; degenerate boxes dropped. */
  static toBox(v: unknown): Box | null {
    if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    const [y0, x0, y1, x1] = (v as number[]).map((n) => clamp01(n / 1000));
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    return w > 0.005 && h > 0.005 ? { x, y, w, h } : null;
  }
}
