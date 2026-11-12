import type { AiConfig } from './ai/LLMProviderFactory.js';

export interface Config {
  port: number;
  pbUrl: string;
  pbSuperuserEmail: string;
  pbSuperuserPassword: string;
  qrWindowSec: number;
  adminEmails: string[];
  googleServiceAccountFile?: string;
  googleSheetsId?: string;
  ai: AiConfig;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 8787),
    pbUrl: process.env.PB_URL ?? 'http://127.0.0.1:8090',
    pbSuperuserEmail: required('PB_SUPERUSER_EMAIL'),
    pbSuperuserPassword: required('PB_SUPERUSER_PASSWORD'),
    qrWindowSec: Number(process.env.QR_WINDOW_SEC ?? 10),
    adminEmails: (process.env.ADMIN_EMAILS ?? '').split(','),
    googleServiceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE || undefined,
    googleSheetsId: process.env.GOOGLE_SHEETS_ID || undefined,
    ai: {
      provider: process.env.LLM_PROVIDER === 'gemini' ? 'gemini' : 'mock',
      geminiApiKey: process.env.GEMINI_API_KEY || undefined,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    },
  };
}
