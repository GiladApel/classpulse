import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeworkGuideGenerator } from '../ai/HomeworkGuideGenerator.js';
import { HomeworkReviewer } from '../ai/HomeworkReviewer.js';
import { LectureSummarizer } from '../ai/LectureSummarizer.js';
import { LLMOutputError } from '../ai/LLMProvider.js';
import { DEFAULT_FIXTURES, MockProvider } from '../ai/MockProvider.js';
import { BackgroundQueue } from '../infra/BackgroundQueue.js';
import { FixedClock } from '../infra/Clock.js';
import {
  InMemoryAssignmentRepository,
  InMemoryInsightsRepository,
  InMemoryRecordingRepository,
  InMemorySubmissionRepository,
} from '../infra/memory/InMemoryContentRepositories.js';
import { UploadStore } from '../infra/UploadStore.js';
import { DomainError } from '../shared/errors.js';
import { makeSession, minimalPdf, T0 } from '../test/fixtures.js';
import { HomeworkAnalysisService, MAX_CHECKS, MIN_CHART_SIZE } from './HomeworkAnalysisService.js';
import { RecordingPipeline } from './RecordingPipeline.js';
import { SimilarityAnalyzer } from './SimilarityAnalyzer.js';
import { TextExtractor } from './TextExtractor.js';

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);
const tempDir = () => mkdtemp(join(tmpdir(), 'cp-test-'));

describe('SimilarityAnalyzer', () => {
  it('returns each pair above the threshold once, most similar first', () => {
    const pairs = SimilarityAnalyzer.pairsAbove(new Map([['a', [1, 2, 3, 4]], ['b', [1, 2, 3, 4]], ['c', [7, 8, 9]], ['d', [1, 2, 3, 5]]]), 0.5);
    expect(pairs.map((p) => `${p.a}-${p.b}`)).toEqual(['a-b', 'a-d', 'b-d']);
    expect(pairs[0].similarity).toBe(1);
  });
});

describe('LectureSummarizer', () => {
  it('sorts chapters, drops malformed items and duplicate start times, caps questions at 5', async () => {
    const llm = new MockProvider({
      summarize_lecture: {
        tldr: ' סיכום ',
        chapters: [{ startSec: 600, title: 'ב', summary: '' }, { startSec: 0, title: 'א', summary: 's' }, { startSec: 600, title: 'כפול', summary: '' }, { startSec: -5, title: 'x' }, { title: 'no time' }],
        concepts: [{ term: 'T', explanation: 'E' }, { term: '', explanation: 'x' }],
        questions: Array.from({ length: 7 }, (_, i) => ({ question: `q${i}`, answer: 'a' })),
      },
    });
    const s = await new LectureSummarizer(llm).summarize({ transcript: '00:00 hello' });
    expect(s.tldr).toBe('סיכום');
    expect(s.chapters.map((c) => c.title)).toEqual(['א', 'ב']);
    expect(s.concepts).toHaveLength(1);
    expect(s.questions).toHaveLength(5);
    expect(llm.calls[0].prompt).toContain('Transcript:\n00:00 hello');
    expect(llm.calls[0].files).toEqual([]);
  });

  it('media goes as an attachment; empty tldr or no chapters is an LLM error', async () => {
    const llm = new MockProvider();
    await new LectureSummarizer(llm).summarize({ media: { mimeType: 'video/mp4', path: '/tmp/x.mp4' } });
    expect(llm.calls[0].files).toEqual([{ mimeType: 'video/mp4', path: '/tmp/x.mp4' }]);
    expect(() => LectureSummarizer.validate({ tldr: '', chapters: [] })).toThrow(LLMOutputError);
    expect(() => LectureSummarizer.validate({ tldr: 'x', chapters: [] })).toThrow('no valid chapters');
  });
});

describe('UploadStore', () => {
  it('appends in order, ignores a repeated chunk, rejects a gap', async () => {
    const store = new UploadStore(await tempDir());
    expect(await store.append('r1', 0, Buffer.from('abc'))).toBe(3);
    expect(await store.append('r1', 0, Buffer.from('abc'))).toBe(3);
    expect(await store.append('r1', 5, Buffer.from('x'))).toBeNull();
    expect(await store.append('r1', 3, Buffer.from('de'))).toBe(5);
    await store.remove('r1');
    expect(await store.size('r1')).toBe(0);
    expect(() => store.path('../etc')).toThrow();
  });
});

describe('BackgroundQueue', () => {
  it('runs jobs in order and a failing job does not stop the next', async () => {
    const q = new BackgroundQueue();
    const ran: number[] = [];
    q.add('1', async () => void ran.push(1));
    q.add('2', async () => {
      throw new Error('boom');
    });
    q.add('3', async () => void ran.push(3));
    await q.idle();
    expect(ran).toEqual([1, 3]);
    expect(q.size).toBe(0);
  });
});

describe('RecordingPipeline', () => {
  let clock: FixedClock;
  let repo: InMemoryRecordingRepository;
  let uploads: UploadStore;
  let queue: BackgroundQueue;
  let llm: MockProvider;
  let lostAt: { at: Date; n: string }[];
  const session = makeSession({ startedAt: T0 });

  const pipeline = () =>
    new RecordingPipeline(
      repo,
      uploads,
      new LectureSummarizer(llm),
      {
        // Same bucketing contract as ConfusionMeter.series, from a fixed list of signals.
        series: async (_id, from, to, bucketSec = 60) => {
          const n = Math.ceil((to.getTime() - from.getTime()) / (bucketSec * 1000));
          return Array.from({ length: n }, (_, i) => ({
            t: new Date(from.getTime() + i * bucketSec * 1000),
            count: new Set(lostAt.filter((s) => Math.floor((s.at.getTime() - from.getTime()) / (bucketSec * 1000)) === i).map((s) => s.n)).size,
          }));
        },
      },
      { presentCount: async () => 10 },
      queue,
      clock,
    );

  beforeEach(async () => {
    clock = new FixedClock(T0);
    repo = new InMemoryRecordingRepository();
    uploads = new UploadStore(await tempDir());
    queue = new BackgroundQueue();
    llm = new MockProvider();
    lostAt = [];
  });

  it('chunked upload → queued → summary; the temp file is always deleted', async () => {
    const p = pipeline();
    const rec = await p.start(session, { filename: 'lecture.mp4', mimeType: 'video/mp4', sizeBytes: 6, offsetSec: 120 });
    expect(rec).toMatchObject({ kind: 'media', status: 'uploading', offsetSec: 120 });
    expect(await code(p.complete(rec))).toBe('UPLOAD_INCOMPLETE');
    expect(await p.appendChunk(rec, 0, Buffer.from('abc'))).toBe(3);
    expect(await code(p.appendChunk(rec, 5, Buffer.from('z')))).toBe('UPLOAD_GAP');
    expect(await code(p.appendChunk(rec, 3, Buffer.from('defg')))).toBe('UPLOAD_TOO_LONG');
    await p.appendChunk(rec, 3, Buffer.from('def'));
    expect((await p.complete(rec)).status).toBe('queued');
    await queue.idle();

    const done = await p.get(rec.id);
    expect(done.status).toBe('done');
    expect(done.summary?.chapters.length).toBeGreaterThan(0);
    expect(llm.calls[0].files?.[0]).toEqual({ mimeType: 'video/mp4', path: uploads.path(rec.id) });
    expect(await uploads.size(rec.id)).toBe(0);
    expect(await code(p.appendChunk(done, 6, Buffer.from('x')))).toBe('UPLOAD_CLOSED');
  });

  it('transcripts are sent as text; an LLM failure marks the recording failed and still deletes the file', async () => {
    llm = new MockProvider({ summarize_lecture: { tldr: '', chapters: [] } });
    const p = pipeline();
    const rec = await p.start(session, { filename: 'lecture.vtt', mimeType: '', sizeBytes: 5, offsetSec: 0 });
    expect(rec.kind).toBe('transcript');
    await p.appendChunk(rec, 0, Buffer.from('hello'));
    await p.complete(rec);
    await queue.idle();
    expect(llm.calls[0].prompt).toContain('Transcript:\nhello');
    expect(await p.get(rec.id)).toMatchObject({ status: 'failed', error: 'ה-AI החזיר סיכום לא תקין — נסו שוב' });
    expect(await uploads.size(rec.id)).toBe(0);
  });

  it('rejects unsupported and oversized files', async () => {
    const p = pipeline();
    expect(await code(p.start(session, { filename: 'x.docx', mimeType: 'application/msword', sizeBytes: 5, offsetSec: 0 }))).toBe('UNSUPPORTED_FILE');
    expect(await code(p.start(session, { filename: 'x.txt', mimeType: 'text/plain', sizeBytes: 3 * 1024 * 1024, offsetSec: 0 }))).toBe('FILE_TOO_LARGE');
  });

  it('timeline shifts "lost" buckets onto the recording clock and names the chapter of each spike', async () => {
    const p = pipeline();
    const rec = await repo.create({
      ...(await p.start(session, { filename: 'l.mp4', mimeType: 'video/mp4', sizeBytes: 1, offsetSec: 120 })),
      status: 'done',
      summary: DEFAULT_FIXTURES.summarize_lecture as never,
    });
    // Recording started 2 min into the session; 3 students lost 23–24 min into the session = 21 min into the recording.
    const at = (min: number) => new Date(T0.getTime() + min * 60_000);
    lostAt = [{ at: at(23.2), n: '1' }, { at: at(23.5), n: '2' }, { at: at(23.9), n: '3' }, { at: at(23.95), n: '3' }, { at: at(40), n: '1' }];
    const ended = { ...session, endedAt: at(45) };
    const t = await p.timeline(ended, rec);
    expect(t.buckets[0]).toEqual({ t: 0, count: 0 }); // buckets entirely before the recording started are dropped
    expect(t.buckets.find((b) => b.t === 21 * 60)?.count).toBe(3);
    expect(t.spikes).toEqual([{ t: 1260, count: 3, chapter: 'State' }]);
  });

  it('publish only when done; restart recovery fails unfinished jobs', async () => {
    const p = pipeline();
    const rec = await p.start(session, { filename: 'l.mp4', mimeType: 'video/mp4', sizeBytes: 3, offsetSec: 0 });
    expect(await code(p.publish(rec, true))).toBe('NOT_READY');
    await p.appendChunk(rec, 0, Buffer.from('abc'));
    expect(await p.recoverInterrupted()).toBe(1);
    expect(await p.get(rec.id)).toMatchObject({ status: 'failed' });
    expect(await uploads.size(rec.id)).toBe(0);
  });
});

describe('HomeworkAnalysisService', () => {
  let assignments: InMemoryAssignmentRepository;
  let subs: InMemorySubmissionRepository;
  let insights: InMemoryInsightsRepository;
  let queue: BackgroundQueue;
  let clock: FixedClock;
  let llm: MockProvider;
  let fx: typeof DEFAULT_FIXTURES;
  let svc: HomeworkAnalysisService;
  const course = { id: 'c1', code: 'I2SE', name: 'הנדסת תוכנה', lecturerId: 'lect1' };
  const inCourse = new Set(['1', '2', '3', '4']);
  const student = (n: string) => ({ id: `u${n}`, studentNumber: n, name: `סטודנט ${n}` });
  const homeworkPdf = { data: Buffer.from('%PDF-1.4 homework'), filename: 'hw.pdf', mimeType: 'application/pdf' };
  const solution = (text = 'Strategy lets the algorithm change at runtime, unlike a long if/else chain in the client') => [
    { data: minimalPdf(text), filename: 'sol.pdf', mimeType: 'application/pdf' },
  ];
  const photo = [{ data: Buffer.from([0xff, 0xd8, 0xff]), filename: 'p1.jpg', mimeType: 'image/jpeg' }];

  const make = () =>
    new HomeworkAnalysisService(
      assignments,
      subs,
      insights,
      new TextExtractor(),
      new HomeworkGuideGenerator(llm),
      new HomeworkReviewer(llm),
      {
        requireMember: async (_c, n) => {
          if (!inCourse.has(n)) throw new DomainError('NOT_IN_COURSE', 'x');
        },
      },
      queue,
      clock,
    );

  const ready = async () => {
    const a = await svc.publish(course, { title: 'תרגיל 2', sessionId: 's1' }, homeworkPdf);
    await queue.idle();
    return svc.getAssignment(a.id);
  };

  beforeEach(() => {
    assignments = new InMemoryAssignmentRepository();
    subs = new InMemorySubmissionRepository();
    insights = new InMemoryInsightsRepository();
    assignments.onDelete = (id) => subs.removeByAssignment(id);
    queue = new BackgroundQueue();
    clock = new FixedClock(T0);
    fx = { ...DEFAULT_FIXTURES };
    llm = new MockProvider(fx);
    svc = make();
  });

  it('publish stores the PDF and reads it in the background into a hidden guide and a public outline', async () => {
    const a = await svc.publish(course, { title: '  תרגיל 2 ', sessionId: 's1' }, homeworkPdf);
    expect(a).toMatchObject({ title: 'תרגיל 2', sessionId: 's1', guideStatus: 'generating', outline: null });
    await queue.idle();
    const done = await svc.getAssignment(a.id);
    expect(done.guideStatus).toBe('ready');
    expect(done.outline?.questions.map((q) => q.sections.map((s) => s.id))).toEqual([['q1.1', 'q1.2'], ['q2.1']]);
    expect(JSON.stringify(done)).not.toContain('Context מחזיק'); // the expected answer stays in the hidden guide
    expect((await assignments.getGuide(a.id))?.questions[0].sections[1].expected).toBe('Context מחזיק הפניה לממשק');
    expect(llm.calls[0].files).toEqual([{ mimeType: 'application/pdf', data: homeworkPdf.data }]);
    expect(await code(svc.publish(course, { title: ' ' }, homeworkPdf))).toBe('INVALID_ASSIGNMENT');
  });

  it('a guide that fails can be retried from the stored PDF', async () => {
    fx.generate_homework_guide = { questions: [] };
    const a = await svc.publish(course, { title: 'x' }, homeworkPdf);
    await queue.idle();
    const failed = await svc.getAssignment(a.id);
    expect(failed).toMatchObject({ guideStatus: 'failed', guideError: expect.stringContaining('לא הצליח לזהות שאלות') });
    expect(await code(svc.check(failed, student('1'), solution()))).toBe('GUIDE_NOT_READY');

    fx.generate_homework_guide = DEFAULT_FIXTURES.generate_homework_guide;
    expect((await svc.retryGuide(failed)).guideStatus).toBe('generating');
    await queue.idle();
    expect((await svc.getAssignment(a.id)).guideStatus).toBe('ready');
    expect(await code(svc.retryGuide(await svc.getAssignment(a.id)))).toBe('GUIDE_NOT_FAILED');
  });

  it('a check gives a per-section report and the server-side scores; the solution file is not kept', async () => {
    const a = await ready();
    const started = await svc.check(a, student('1'), solution());
    expect(started).toMatchObject({ status: 'processing', checkCount: 0, report: null, total: null });
    await queue.idle();
    const done = await svc.getSubmission(started.id);
    expect(done.status).toBe('done');
    expect(done.checkCount).toBe(1);
    expect(done.report!.marks.map((m) => [m.id, m.answered, m.score])).toEqual([
      ['q1.1', true, 85],
      ['q1.2', true, 60],
      ['q2.1', false, 0],
    ]);
    expect(done.report!.questions).toEqual([
      { id: 'q1', score: 73 },
      { id: 'q2', score: 0 },
    ]);
    expect(done.total).toBe(36); // (72.5 + 0) / 2 rounded
    const call = llm.calls.at(-1)!;
    expect(call.task).toBe('review_homework_solution');
    expect(call.prompt).toContain('Context מחזיק הפניה לממשק'); // the reviewer sees the expected answers
    expect(JSON.stringify(done)).not.toContain('Strategy lets the algorithm');
    expect(subs.sketches.get(done.id)?.length).toBeGreaterThan(0);
  });

  it('photos are reviewed too (no fingerprint); non-members and a running check are rejected', async () => {
    const a = await ready();
    expect(await code(svc.check(a, student('9'), photo))).toBe('NOT_IN_COURSE');
    const s = await svc.check(a, student('2'), photo);
    expect(await code(svc.check(a, student('2'), photo))).toBe('CHECK_IN_PROGRESS');
    await queue.idle();
    expect((await svc.getSubmission(s.id)).status).toBe('done');
    expect(llm.calls.at(-1)!.files).toEqual([{ mimeType: 'image/jpeg', data: photo[0].data }]);
    expect(subs.sketches.has(s.id)).toBe(false);
  });

  it(`${MAX_CHECKS} checks per homework; a failed check does not count and keeps the previous result`, async () => {
    const a = await ready();
    for (let i = 0; i < MAX_CHECKS; i++) {
      await svc.check(a, student('1'), solution());
      await queue.idle();
      if (i === 0) {
        fx.review_homework_solution = { sections: [{ id: 'nope' }] };
        await svc.check(a, student('1'), solution());
        await queue.idle();
        const failed = await subs.findByAssignmentAndStudent(a.id, '1');
        expect(failed).toMatchObject({ status: 'failed', checkCount: 1, total: 36, error: expect.stringContaining('לא נספרה') });
        fx.review_homework_solution = DEFAULT_FIXTURES.review_homework_solution;
      }
    }
    expect((await subs.findByAssignmentAndStudent(a.id, '1'))?.checkCount).toBe(MAX_CHECKS);
    expect(await code(svc.check(a, student('1'), solution()))).toBe('NO_CHECKS_LEFT');
  });

  it(`the chart: students see anonymous rows with their own marked, from ${MIN_CHART_SIZE} checked students; the lecturer sees names`, async () => {
    const a = await ready();
    for (const n of ['1', '2']) {
      await svc.check(a, student(n), solution());
      await queue.idle();
    }
    expect(await svc.chart(a, { lecturer: false, studentNumber: '1' })).toEqual({ visible: false, checked: 2, rows: [] });
    const mine = (await svc.view((await subs.findByAssignmentAndStudent(a.id, '1'))!));
    expect(mine).toMatchObject({ place: null, checked: 2, checksLeft: MAX_CHECKS - 1 });

    await svc.check(a, student('3'), solution());
    await queue.idle();
    const chart = await svc.chart(a, { lecturer: false, studentNumber: '1' });
    expect(chart.visible).toBe(true);
    expect(chart.rows).toHaveLength(3);
    expect(chart.rows.filter((r) => r.mine)).toHaveLength(1);
    expect(JSON.stringify(chart)).not.toContain('סטודנט');
    expect(chart.rows[0]).toMatchObject({ total: 36, questions: { q1: 73, q2: 0 }, sections: { 'q1.1': 85, 'q1.2': 60, 'q2.1': 0 } });
    expect((await svc.view((await subs.findByAssignmentAndStudent(a.id, '1'))!)).place).toBe(1); // all tied

    const lecturer = await svc.chart(a, { lecturer: true, studentNumber: '' });
    expect(lecturer.rows.map((r) => r.studentName).sort()).toEqual(['סטודנט 1', 'סטודנט 2', 'סטודנט 3']);
  });

  it('insights: common mistakes from the reports and the copied pair; delete removes the homework and its checks', async () => {
    const a = await ready();
    const text = 'Strategy lets the algorithm change at runtime, unlike a long if/else chain in the client code';
    for (const n of ['1', '2']) {
      await svc.check(a, student(n), solution(text));
      await queue.idle();
    }
    await svc.check(a, student('3'), solution('Observer pushes updates to subscribers so nobody has to poll the server again and again'));
    await queue.idle();
    const built = await svc.buildInsights(a);
    expect(built.submissionCount).toBe(3);
    expect(built.commonMistakes[0].title).toBe('חסרות בדיקות יחידה');
    const ids = (await svc.listSubmissions(a.id)).filter((s) => s.studentNumber !== '3').map((s) => s.id).sort();
    expect(built.similarPairs.map((p) => [p.a, p.b].sort())).toEqual([ids]);

    await svc.remove(a);
    expect(await code(svc.getAssignment(a.id))).toBe('NOT_FOUND');
    expect(await svc.listSubmissions(a.id)).toEqual([]);
  });

  it('a late check is marked; restart recovery fails a running check and a guide being read', async () => {
    const a = await svc.getAssignment((await ready()).id);
    await assignments.update(a.id, { dueAt: new Date(T0.getTime() - 1000) });
    const late = await svc.check(await svc.getAssignment(a.id), student('1'), solution());
    expect(late.late).toBe(true);
    await queue.idle();

    // As if the server stopped mid-way: a check and a guide still marked as running.
    await subs.update(late.id, { status: 'processing' });
    const reading = await assignments.create({ courseId: 'c1', title: 'שנייה', createdAt: T0, guideStatus: 'generating', guideError: '', outline: null });
    expect(await svc.recoverInterrupted()).toBe(2);
    expect(await svc.getSubmission(late.id)).toMatchObject({ status: 'failed', checkCount: 1 });
    expect((await svc.getAssignment(reading.id)).guideStatus).toBe('failed');
  });
});

describe('TextExtractor', () => {
  it('reads a real PDF text layer', async () => {
    const { text, kind } = await new TextExtractor().extract({ data: minimalPdf('Strategy pattern homework answer'), filename: 'hw.pdf', mimeType: 'application/pdf' });
    expect(text).toContain('Strategy pattern homework answer');
    expect(kind).toBe('prose');
    expect(await code(new TextExtractor().extract({ data: Buffer.from('not a pdf'), filename: 'hw.pdf', mimeType: 'application/pdf' }))).toBe('UNREADABLE_FILE');
  });
});


// The pipeline relies on remove() to honour "recordings are never kept".
it('UploadStore leaves no files behind after remove', async () => {
  const dir = await tempDir();
  const store = new UploadStore(dir);
  await store.append('x', 0, Buffer.from('a'));
  await store.remove('x');
  expect(await readdir(dir)).toEqual([]);
});
