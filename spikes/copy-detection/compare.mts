/**
 * Field test T9: can we tell a copied solution from honest work?
 * Compares every pair of the five solutions in ./solutions with
 *   1. token fingerprints (the production Fingerprinter: normalised tokens, MinHash sketch), offline;
 *   2. Gemini embeddings (cosine similarity), only when GEMINI_API_KEY is set.
 * s4 is s2 with every identifier renamed and a comment added. Writes result.json next to this file.
 *
 *   npx tsx spikes/copy-detection/compare.mts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Fingerprinter } from '../../apps/api/src/content/Fingerprinter.js';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '../..');
try {
  process.loadEnvFile(join(ROOT, '.env'));
} catch {
  // no .env: fingerprints only
}

const files = readdirSync(join(HERE, 'solutions')).filter((f) => f.endsWith('.java')).sort();
const texts = Object.fromEntries(files.map((f) => [f.replace('.java', ''), readFileSync(join(HERE, 'solutions', f), 'utf8')]));
const names = Object.keys(texts);
const pairs = names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b] as const));
const round = (x: number) => Math.round(x * 100) / 100;

const sketches = Object.fromEntries(names.map((n) => [n, Fingerprinter.sketch(texts[n], 'code')]));
const fingerprint = Object.fromEntries(pairs.map(([a, b]) => [`${a}-${b}`, round(Fingerprinter.similarity(sketches[a], sketches[b]))]));

const cosine = (x: number[], y: number[]) => {
  let dot = 0, nx = 0, ny = 0;
  for (let i = 0; i < x.length; i++) {
    dot += x[i] * y[i];
    nx += x[i] * x[i];
    ny += y[i] * y[i];
  }
  return dot / Math.sqrt(nx * ny);
};

let embedding: Record<string, number> | null = null;
const model = 'gemini-embedding-001';
if (process.env.GEMINI_API_KEY) {
  const { GoogleGenAI } = createRequire(join(ROOT, 'apps/api/package.json'))('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // One call per text: a multi-item request can come back as a single merged vector.
  const vectors: Record<string, number[]> = {};
  for (const n of names) {
    const res = await ai.models.embedContent({ model, contents: texts[n] });
    vectors[n] = res.embeddings[0].values;
  }
  embedding = Object.fromEntries(pairs.map(([a, b]) => [`${a}-${b}`, round(cosine(vectors[a], vectors[b]))]));
}

const result = {
  measuredAt: new Date().toISOString().slice(0, 10),
  copiedPair: 's2-s4',
  fingerprint,
  embedding: embedding ? { model, scores: embedding } : 'skipped (no GEMINI_API_KEY)',
};
writeFileSync(join(HERE, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);

const honest = (scores: Record<string, number>) => Math.max(...Object.entries(scores).filter(([k]) => k !== 's2-s4').map(([, v]) => v));
console.log(`fingerprint: copy ${fingerprint['s2-s4']}, highest honest pair ${honest(fingerprint)}`);
if (embedding) console.log(`embedding:   copy ${embedding['s2-s4']}, highest honest pair ${honest(embedding)}`);
