import { GoogleGenAI } from '@google/genai';
import { type LLMProvider, LLMOutputError, type StructuredRequest } from './LLMProvider.js';

export class GeminiProvider implements LLMProvider {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    // Gemini returns 503 "high demand" spikes; retries are off unless retryOptions is set. Bounded so a lecturer waits ≤ ~15 s.
    this.client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 4, initialDelay: 1, maxDelay: 8 } } });
  }

  async generateStructured<T>(req: StructuredRequest): Promise<T> {
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            ...(req.files ?? []).map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data.toString('base64') } })),
            { text: req.prompt },
          ],
        },
      ],
      config: { responseMimeType: 'application/json', responseJsonSchema: req.schema, temperature: 0 },
    });
    try {
      return JSON.parse(res.text ?? '') as T;
    } catch {
      throw new LLMOutputError(`Gemini returned non-JSON for task ${req.task}`);
    }
  }
}
