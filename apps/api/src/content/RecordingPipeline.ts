import { readFile } from 'node:fs/promises';
import type { LectureSummarizer, LectureSource } from '../ai/LectureSummarizer.js';
import { LLMOutputError } from '../ai/LLMProvider.js';
import type { AttendanceService } from '../attendance/AttendanceService.js';
import type { Session } from '../attendance/types.js';
import type { ConfusionMeter } from '../engagement/ConfusionMeter.js';
import type { BackgroundQueue } from '../infra/BackgroundQueue.js';
import type { Clock } from '../infra/Clock.js';
import type { UploadStore } from '../infra/UploadStore.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import type { RecordingRepository } from './repositories.js';
import type { Recording, RecordingKind, Timeline } from './types.js';

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
    } catch (e) {
      console.error(`Recording ${recordingId} failed:`, e);
      const error = e instanceof LLMOutputError ? 'ה-AI החזיר סיכום לא תקין — נסו שוב' : 'העיבוד נכשל — נסו שוב או העלו תמליל';
      await this.recordings.update(recordingId, { status: 'failed', error, processedAt: this.clock.now() });
    } finally {
      await this.uploads.remove(recordingId);
    }
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
