/**
 * Field test T3: summarise a lecture recording (or transcript) with the production LectureSummarizer and
 * LectureCoach, through the Gemini Files API for large media.
 *
 *   npx tsx spikes/lecture-summary/make-lecture.mts lecture.pcm   # optional: an 88 s Hebrew test lecture (TTS)
 *   ffmpeg -f s16le -ar 24000 -ac 1 -i lecture.pcm -f lavfi -i color=c=white:s=640x360 -shortest lecture.mp4
 *   npx tsx spikes/lecture-summary/summarize.mts lecture.mp4
 *
 * Needs GEMINI_API_KEY in the repo's .env. Writes result.json next to this file.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GeminiProvider } from '../../apps/api/src/ai/GeminiProvider.js';
import { LectureCoach } from '../../apps/api/src/ai/LectureCoach.js';
import { LectureSummarizer } from '../../apps/api/src/ai/LectureSummarizer.js';

const HERE = import.meta.dirname;
process.loadEnvFile(join(HERE, '../../.env'));
const [file] = process.argv.slice(2);
if (!file) throw new Error('usage: summarize.mts <lecture.mp4|.txt>');

const llm = new GeminiProvider(process.env.GEMINI_API_KEY!, process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite');
const source = file.endsWith('.txt')
  ? { transcript: (await import('node:fs')).readFileSync(file, 'utf8') }
  : { media: { mimeType: file.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4', path: file } };

let t = Date.now();
const summary = await new LectureSummarizer(llm).summarize(source);
const summaryMs = Date.now() - t;
t = Date.now();
const coaching = await new LectureCoach(llm).review(source, { lostSpikes: [], unansweredQuestions: [], polls: [], feedback: { responses: 0, counts: null } });
const coachingMs = Date.now() - t;

writeFileSync(join(HERE, 'result.json'), `${JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), file, summaryMs, coachingMs, summary, coaching }, null, 2)}\n`);
console.log({ summaryMs, chapters: summary.chapters.map((c) => c.startSec), coachingMs, scores: coaching.scores });
