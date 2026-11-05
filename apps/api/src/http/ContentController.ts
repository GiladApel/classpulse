import { Hono } from 'hono';
import type { SessionService } from '../attendance/SessionService.js';
import type { RecordingPipeline } from '../content/RecordingPipeline.js';
import type { Recording } from '../content/types.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { ValidationError } from './errors.js';
import { jsonBody, num, str } from './validate.js';

/** Below Cloudflare's 100 MB request cap with room to spare. */
export const MAX_CHUNK_BYTES = 50 * 1024 * 1024;

export const recordingDto = (r: Recording) => ({
  id: r.id,
  sessionId: r.sessionId,
  kind: r.kind,
  filename: r.filename,
  sizeBytes: r.sizeBytes,
  offsetSec: r.offsetSec,
  status: r.status,
  error: r.error,
  summary: r.summary,
  published: r.published,
});

/** Lecture recordings: chunked upload → background summary → timeline → publish. Lecturer-only. */
export class ContentController {
  constructor(
    private readonly recordings: RecordingPipeline,
    private readonly sessions: SessionService,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.post('/sessions/:id/recordings', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      const b = await jsonBody(c.req);
      const recording = await this.recordings.start(session, {
        filename: str(b, 'filename', { max: 200 }),
        mimeType: str(b, 'mimeType', { max: 100, optional: true }),
        sizeBytes: num(b, 'sizeBytes', 1, Number.MAX_SAFE_INTEGER),
        offsetSec: b.offsetSec === undefined ? 0 : num(b, 'offsetSec', -6 * 3600, 6 * 3600),
      });
      return c.json({ ...recordingDto(recording), chunkBytes: MAX_CHUNK_BYTES }, 201);
    });

    // Raw bytes (not multipart) so a 50 MB chunk is one buffer; ?offset= is the chunk's first byte.
    app.put('/recordings/:id/data', requireLecturer, async (c) => {
      const recording = await this.owned(c.req.param('id'), c.get('user').id);
      const offset = Number(c.req.query('offset'));
      if (!Number.isInteger(offset) || offset < 0) throw new ValidationError('offset must be a non-negative integer');
      const length = Number(c.req.header('content-length') ?? 0);
      if (length > MAX_CHUNK_BYTES) throw new ValidationError('chunk is larger than 50 MB');
      const data = Buffer.from(await c.req.arrayBuffer());
      if (data.length === 0 || data.length > MAX_CHUNK_BYTES) throw new ValidationError('chunk must be 1 byte to 50 MB');
      return c.json({ received: await this.recordings.appendChunk(recording, offset, data) });
    });

    app.post('/recordings/:id/complete', requireLecturer, async (c) => {
      const recording = await this.owned(c.req.param('id'), c.get('user').id);
      return c.json(recordingDto(await this.recordings.complete(recording)), 202);
    });

    app.get('/recordings/:id/timeline', requireLecturer, async (c) => {
      const recording = await this.owned(c.req.param('id'), c.get('user').id);
      return c.json(await this.recordings.timeline(await this.sessions.get(recording.sessionId), recording));
    });

    app.post('/recordings/:id/publish', requireLecturer, async (c) => {
      const recording = await this.owned(c.req.param('id'), c.get('user').id);
      const b = await jsonBody(c.req);
      if (typeof b.published !== 'boolean') throw new ValidationError('published must be a boolean');
      return c.json(recordingDto(await this.recordings.publish(recording, b.published)));
    });

    return app;
  }

  private async owned(recordingId: string, lecturerId: string): Promise<Recording> {
    const recording = await this.recordings.get(recordingId);
    await this.sessions.getOwned(recording.sessionId, lecturerId);
    return recording;
  }
}
