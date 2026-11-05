import { GeminiProvider } from './GeminiProvider.js';
import type { LLMProvider } from './LLMProvider.js';
import { MockProvider } from './MockProvider.js';

export interface AiConfig {
  provider: 'gemini' | 'mock';
  geminiApiKey?: string;
  geminiModel: string;
}

export class LLMProviderFactory {
  static create(cfg: AiConfig): LLMProvider {
    if (cfg.provider === 'gemini') {
      if (!cfg.geminiApiKey) throw new Error('LLM_PROVIDER=gemini requires GEMINI_API_KEY');
      return new GeminiProvider(cfg.geminiApiKey, cfg.geminiModel);
    }
    return new MockProvider();
  }
}
