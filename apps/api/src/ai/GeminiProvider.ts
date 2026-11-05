import { createPartFromUri, FileState, GoogleGenAI, MediaResolution, type Part } from '@google/genai';
import type { Attachment, LLMProvider, StructuredRequest } from './LLMProvider.js';
import { LLMOutputError } from './LLMProvider.js';

/** Inline request data is capped at ~20 MB; anything bigger goes through the Files API. */
const INLINE_LIMIT = 15 * 1024 * 1024;

export class GeminiProvider implements LLMProvider {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly filePollMs = 3000,
  ) {
    // Gemini returns 503 "high demand" spikes; retries are off unless retryOptions is set. Bounded so a lecturer waits ≤ ~15 s.
    this.client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 4, initialDelay: 1, maxDelay: 8 } } });
  }

  async generateStructured<T>(req: StructuredRequest): Promise<T> {
    const uploaded: string[] = [];
    try {
      const parts: Part[] = [];
      for (const f of req.files ?? []) parts.push(await this.toPart(f, uploaded));
      parts.push({ text: req.prompt });
      const hasMedia = (req.files ?? []).some((f) => /^(video|audio)\//.test(f.mimeType));
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: req.schema,
          temperature: 0,
          // ~66 instead of ~258 tokens per video frame: a 90-minute lecture then fits the context window.
          ...(hasMedia ? { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW } : {}),
        },
      });
      try {
        return JSON.parse(res.text ?? '') as T;
      } catch {
        throw new LLMOutputError(`Gemini returned non-JSON for task ${req.task}`);
      }
    } finally {
      for (const name of uploaded) await this.client.files.delete({ name }).catch(() => {});
    }
  }

  private async toPart(f: Attachment, uploaded: string[]): Promise<Part> {
    if ('data' in f && f.data.length <= INLINE_LIMIT) return { inlineData: { mimeType: f.mimeType, data: f.data.toString('base64') } };
    const file = await this.client.files.upload({
      file: 'path' in f ? f.path : new Blob([new Uint8Array(f.data)], { type: f.mimeType }),
      config: { mimeType: f.mimeType },
    });
    if (file.name) uploaded.push(file.name);
    // Video is transcoded server-side before it can be used.
    let current = file;
    while (current.state === FileState.PROCESSING) {
      await new Promise((r) => setTimeout(r, this.filePollMs));
      current = await this.client.files.get({ name: file.name! });
    }
    if (current.state !== FileState.ACTIVE || !current.uri) throw new LLMOutputError(`Gemini could not process the file (${current.state})`);
    return createPartFromUri(current.uri, f.mimeType);
  }
}
