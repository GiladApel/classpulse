import { DomainError } from '../shared/errors.js';

/** In-memory bytes for small inputs (photos, slides); a file path for large media that must not be loaded into memory. */
export type InlineAttachment = { mimeType: string; data: Buffer };
export type Attachment = InlineAttachment | { mimeType: string; path: string };

export type JsonSchema = Record<string, unknown>;

export interface StructuredRequest {
  /** Stable task id; MockProvider keys its fixtures by it. */
  task: string;
  prompt: string;
  schema: JsonSchema;
  files?: Attachment[];
}

export interface LLMProvider {
  generateStructured<T>(req: StructuredRequest): Promise<T>;
}

export class LLMOutputError extends DomainError {
  constructor(message: string) {
    super('LLM_OUTPUT', message);
  }
}
