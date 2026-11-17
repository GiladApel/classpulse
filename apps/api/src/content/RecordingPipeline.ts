import { readFile } from 'node:fs/promises';
import type { LectureCoach } from '../ai/LectureCoach.js';
import type { LectureSummarizer, LectureSource } from '../ai/LectureSummarizer.js';
import { LLMOutputError } from '../ai/LLMProvider.js';
import type { AttendanceService } from '../attendance/AttendanceService.js';
import type { Session } from '../attendance/types.js';
import type { ConfusionMeter } from '../engagement/ConfusionMeter.js';
import type { BackgroundQueue } from '../infra/BackgroundQueue.js';
import type { Clock } from '../infra/Clock.js';
import type { UploadStore } from '../infra/UploadStore.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import type { LessonSignals } from './LessonSignals.js';
import type { RecordingRepository } from './repositories.js';
import type { ClassSignals, LectureCoaching, LectureSummary, Recording, RecordingKind, Timeline } from './types.js';

/** One lesson's report scores, for the lecturer's trend across the course. */
export interface CoachingTrendPoint {
  sessionId: string;
  title: string;
  startedAt: Date;
  scores: LectureCoaching['scores'];
}

export interface RecordingMeta {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  offsetSec: number;
}

/** Gemini Files API limit. */
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;
const TRANSCRIPT_EXT = /\.(vtt|srt|txt)$/i;

export class RecordingPipeline {
  constructor(
    private readonly recordings: RecordingRepository,
    private readonly uploads: UploadStore,
    private readonly summarizer: LectureSummarizer,
    private readonly coach: Pick<LectureCoach, 'review'>,
    private readonly lessons: Pick<LessonSignals, 'session' | 'of' | 'lessonsOf'>,
    private readonly confusion: Pick<ConfusionMeter, 'series'>,
    private readonly attendance: Pick<AttendanceService, 'presentCount'>,
    private readonly queue: BackgroundQueue,
    private readonly clock: Clock,
  ) {}

  static kindOf(mimeType: string, filename: string): RecordingKind | null {
    if (/^(video|audio)\//.test(mimeType)) return 'media';
    if (TRANSCRIPT_EXT.test(filename) || /^text\/(plain|vtt)$/.test(mimeType)) return 'transcript';
    return null;
  }

  async start(session: Session, meta: RecordingMeta): Promise<Recording> {
    const kind = RecordingPipeline.kindOf(meta.mimeType, meta.filename);
    if (!kind) throw new DomainError('UNSUPPORTED_FILE', 'אפשר להעלות וידאו, אודיו או תמליל (vtt/srt/txt)');
    const max = kind === 'media' ? MAX_MEDIA_BYTES : MAX_TRANSCRIPT_BYTES;
    if (meta.sizeBytes < 1 || meta.sizeBytes > max) throw new DomainError('FILE_TOO_LARGE', kind === 'media' ? 'הקובץ גדול מ-2GB' : 'התמליל גדול מ-2MB');
    return this.recordings.create({
      sessionId: session.id,
      kind,
      filename: meta.filename,
      mimeType: kind === 'transcript' ? 'text/plain' : meta.mimeType,
      sizeBytes: meta.sizeBytes,
      offsetSec: Math.round(meta.offsetSec),
      status: 'uploading',
      error: '',
      summary: null,
      coaching: null,
      coachingError: '',
      published: false,
      createdAt: this.clock.now(),
    });
  }

  /** Returns how many bytes the server holds, so a client can resume after a failed chunk. */
  async appendChunk(recording: Recording, offset: number, data: Buffer): Promise<number> {
    if (recording.status !== 'uploading') throw new DomainError('UPLOAD_CLOSED', 'ההעלאה כבר הסתיימה');
    if (offset + data.length > recording.sizeBytes) throw new DomainError('UPLOAD_TOO_LONG', 'הקובץ ארוך מהגודל שהוצהר');
    const received = await this.uploads.append(recording.id, offset, data);
    if (received === null) throw new DomainError('UPLOAD_GAP', `חסר מקטע: יש לשלוח מבייט ${await this.uploads.size(recording.id)}`);
    return received;
  }

  async complete(recording: Recording): Promise<Recording> {
    if (recording.status !== 'uploading') throw new DomainError('UPLOAD_CLOSED', 'ההעלאה כבר הסתיימה');
    const received = await this.uploads.size(recording.id);
    if (received !== recording.sizeBytes) throw new DomainError('UPLOAD_INCOMPLETE', `התקבלו ${received} מתוך ${recording.sizeBytes} בתים`);
    const queued = await this.recordings.update(recording.id, { status: 'queued' });
    this.queue.add(`recording ${recording.id}`, () => this.process(recording.id));
    return queued;
  }

  /** The upload is deleted whatever happens: recordings are never kept, only their summary. */
  async process(recordingId: string): Promise<void> {
    const recording = await this.get(recordingId);
    await this.recordings.update(recordingId, { status: 'processing' });
    try {
      const path = this.uploads.path(recordingId);
      const source: LectureSource =
        recording.kind === 'media' ? { media: { mimeType: recording.mimeType, path } } : { transcript: (await readFile(path, 'utf8')).slice(0, 500_000) };
      const summary = await this.summarizer.summarize(source);
      await this.recordings.update(recordingId, { status: 'done', summary, error: '', processedAt: this.clock.now() });
      // The lecturer's report reads the same source before the file is deleted; its failure never fails the summary.
      await this.runCoaching({ ...recording, summary }, source);
    } catch (e) {
      console.error(`Recording ${recordingId} failed:`, e);
      const error = e instanceof LLMOutputError ? 'ה-AI החזיר סיכום לא תקין — נסו שוב' : 'העיבוד נכשל — נסו שוב או העלו תמליל';
      await this.recordings.update(recordingId, { status: 'failed', error, processedAt: this.clock.now() });
    } finally {
      await this.uploads.remove(recordingId);
    }
  }

  private async runCoaching(recording: Recording, source: LectureSource): Promise<void> {
    try {
      const coaching = await this.coach.review(source, await this.signals(recording));
      await this.recordings.update(recording.id, { coaching, coachingError: '' });
    } catch (e) {
      console.error(`Coaching ${recording.id} failed:`, e);
      const coachingError = e instanceof LLMOutputError ? 'ה-AI החזיר דוח לא תקין — נסו שוב' : 'הכנת הדוח נכשלה — נסו שוב';
      await this.recordings.update(recording.id, { coaching: null, coachingError });
    }
  }

  private async signals(recording: Recording): Promise<ClassSignals> {
    const session = await this.lessons.session(recording.sessionId);
    const rest = await this.lessons.of(recording.sessionId);
    const lostSpikes = session ? (await this.timeline(session, recording)).spikes.map((s) => ({ atSec: s.t, students: s.count, chapter: s.chapter })) : [];
    return { lostSpikes, ...rest };
  }

  /**
   * The recording itself is gone, so a retry reads the stored summary as a stand-in transcript. Allowed when there is a
   * summary and no report yet (or the last one failed).
   */
  async retryCoaching(recording: Recording): Promise<Recording> {
    if (recording.status !== 'done' || !recording.summary) throw new DomainError('NOT_READY', 'אין עדיין סיכום להרצאה הזו');
    await this.runCoaching(recording, { transcript: RecordingPipeline.summaryAsText(recording.summary) });
    return this.get(recording.id);
  }

  static summaryAsText(summary: LectureSummary): string {
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return [summary.tldr, ...summary.chapters.map((c) => `[${mmss(c.startSec)}] ${c.title}: ${c.summary}`)].join('\n');
  }

  /** The three report scores of every lesson in the course that has a report, oldest first. */
  async coachingTrend(courseId: string): Promise<CoachingTrendPoint[]> {
    const lessons = await this.lessons.lessonsOf(courseId);
    const byId = new Map(lessons.map((l) => [l.id, l]));
    const recordings = (await this.recordings.listBySessions(lessons.map((l) => l.id))).filter((r) => r.coaching);
    const latest = new Map<string, Recording>();
    for (const r of recordings) {
      const prev = latest.get(r.sessionId);
      if (!prev || r.createdAt > prev.createdAt) latest.set(r.sessionId, r);
    }
    return [...latest.values()]
      .map((r) => ({ sessionId: r.sessionId, title: byId.get(r.sessionId)!.title, startedAt: byId.get(r.sessionId)!.startedAt, scores: r.coaching!.scores }))
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  }

  /** Jobs live in memory; anything unfinished when the API restarted can never complete. */
  async recoverInterrupted(): Promise<number> {
    const stuck = await this.recordings.listByStatus(['uploading', 'queued', 'processing']);
    for (const r of stuck) {
      await this.recordings.update(r.id, { status: 'failed', error: 'השרת הופעל מחדש באמצע העיבוד — העלו שוב' });
      await this.uploads.remove(r.id);
    }
    return stuck.length;
  }

  /**
   * "I'm lost" counts per bucket, moved onto the recording's clock: t = (signal time − session start) − offsetSec.
   * A spike is a bucket where at least 2 students, and at least 10% of those present, were lost.
   */
  async timeline(session: Session, recording: Recording, bucketSec = 60): Promise<Timeline> {
    const to = session.endedAt ?? this.clock.now();
    const [series, present] = await Promise.all([this.confusion.series(session.id, session.startedAt, to, bucketSec), this.attendance.presentCount(session.id)]);
    const buckets = series
      .map((p) => ({ t: Math.round((p.t.getTime() - session.startedAt.getTime()) / 1000) - recording.offsetSec, count: p.count }))
      .filter((b) => b.t + bucketSec > 0);
    const threshold = Math.max(2, Math.ceil(present * 0.1));
    const chapters = recording.summary?.chapters ?? [];
    const spikes = buckets
      .filter((b) => b.count >= threshold)
      .map((b) => ({ ...b, chapter: [...chapters].reverse().find((c) => c.startSec <= Math.max(0, b.t))?.title ?? null }));
    return { bucketSec, buckets, spikes };
  }

  async publish(recording: Recording, published: boolean): Promise<Recording> {
    if (recording.status !== 'done') throw new DomainError('NOT_READY', 'אפשר לפרסם רק סיכום מוכן');
    return this.recordings.update(recording.id, { published });
  }

  async get(recordingId: string): Promise<Recording> {
    const r = await this.recordings.get(recordingId);
    if (!r) throw new NotFoundError('Recording');
    return r;
  }
}
