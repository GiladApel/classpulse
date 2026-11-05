import type { TemplateKind } from './types.js';

const TEMPLATES: Record<TemplateKind, string[]> = {
  yes_no: ['כן', 'לא'],
  abcd: ['A', 'B', 'C', 'D'],
  scale5: ['1', '2', '3', '4', '5'],
};

export class PollTemplateFactory {
  static readonly kinds = Object.keys(TEMPLATES) as TemplateKind[];

  static options(kind: TemplateKind): string[] {
    return [...TEMPLATES[kind]];
  }
}
