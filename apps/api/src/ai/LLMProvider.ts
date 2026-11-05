import { DomainError } from '../shared/errors.js';

export interface Attachment {
  mimeType: string;
  data: Buffer;
}

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
