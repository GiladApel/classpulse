/**
 * Field tests T2 (headcount accuracy) and T8 (model choice): count the people in a class photo with the production
 * PeopleDetector, once per model and run, and draw the boxes of the last run.
 *
 *   npx tsx spikes/headcount/detect.mts <photo.jpg> [runs=3] [model,model,...]
 *
 * Needs GEMINI_API_KEY in the repo's .env. Class photos are not committed (they show real people).
 * Appends one line per run to results.jsonl and writes <photo>.boxes.jpg.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { GeminiProvider } from '../../apps/api/src/ai/GeminiProvider.js';
import { PeopleDetector } from '../../apps/api/src/ai/PeopleDetector.js';
import { SharpImageProcessor } from '../../apps/api/src/infra/ImageProcessor.js';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '../..');
process.loadEnvFile(join(ROOT, '.env'));
const sharp = createRequire(join(ROOT, 'apps/api/package.json'))('sharp');

const [photo, runs = '3', models = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite'] = process.argv.slice(2);
if (!photo) throw new Error('usage: detect.mts <photo.jpg> [runs] [models]');
const img = await new SharpImageProcessor().normalize(readFileSync(photo));
const { width = 0, height = 0 } = await sharp(img).metadata();

let boxes: { x: number; y: number; w: number; h: number }[] = [];
for (const model of models.split(',')) {
  const detector = new PeopleDetector(new GeminiProvider(process.env.GEMINI_API_KEY!, model));
  for (let i = 1; i <= Number(runs); i++) {
    const started = Date.now();
    try {
      const d = await detector.detect({ mimeType: 'image/jpeg', data: img });
      boxes = d.boxes;
      const line = { model, run: i, count: d.count, confidence: d.confidence, ms: Date.now() - started };
      appendFileSync(join(HERE, 'results.jsonl'), `${JSON.stringify(line)}\n`);
      console.log(line);
    } catch (e) {
      console.log({ model, run: i, error: (e as Error).message.slice(0, 120) });
    }
  }
}

const rects = boxes
  .map((b, i) => `<rect x="${b.x * width}" y="${b.y * height}" width="${b.w * width}" height="${b.h * height}" fill="none" stroke="#ff0" stroke-width="3"/><text x="${b.x * width + 4}" y="${b.y * height + 20}" fill="#ff0" font-size="20">${i + 1}</text>`)
  .join('');
const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`);
writeFileSync(`${photo}.boxes.jpg`, await sharp(img).composite([{ input: svg }]).jpeg().toBuffer());
