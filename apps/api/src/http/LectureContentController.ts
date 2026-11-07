import { Hono } from 'hono';
import type { SessionService } from '../attendance/SessionService.js';
import { MAX_MATERIAL_BYTES, type MaterialService } from '../content/MaterialService.js';
import type { PracticeService } from '../content/PracticeService.js';
import type { Material, PracticeQuestion } from '../content/types.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { ValidationError } from './errors.js';
import { jsonBody, oneOf, str } from './validate.js';

export const practiceDto = (q: PracticeQuestion) => ({
  id: q.id,
  sessionId: q.sessionId,
  question: q.question,
  source: q.source,
});

export const materialDto = (m: Material) => ({
  id: m.id,
  sessionId: m.sessionId,
  title: m.title,
  kind: m.kind,
  url: m.url,
  filename: m.filename,
  addedAt: m.addedAt.toISOString(),
});

/** What the lecturer adds to a lecture page: open practice questions and materials. Students read them from PocketBase. */
export class LectureContentController {
  constructor(
    private readonly practice: PracticeService,
    private readonly materials: MaterialService,
    private readonly sessions: SessionService,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.post('/sessions/:id/practice', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      const b = await jsonBody(c.req);
      const source = b.source === undefined ? 'manual' : oneOf(b, 'source', ['manual', 'ai'] as const);
      return c.json(practiceDto(await this.practice.add(session, str(b, 'question', { max: 300 }), source)), 201);
    });

    // Multipart "deck": the lecture's slides as a PDF (or one image). Returns drafts only; the lecturer adds the ones they want.
    app.post('/sessions/:id/practice/drafts', requireLecturer, async (c) => {
      await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      const deck = (await c.req.parseBody()).deck;
      if (!(deck instanceof File)) throw new ValidationError('deck is required');
      if (deck.size > MAX_MATERIAL_BYTES) throw new ValidationError('deck is larger than 50 MB');
      if (deck.type !== 'application/pdf' && !deck.type.startsWith('image/')) throw new ValidationError('deck must be a PDF or an image');
      return c.json({ drafts: await this.practice.draftFromLecture({ mimeType: deck.type, data: Buffer.from(await deck.arrayBuffer()) }) });
    });

    app.delete('/practice/:id', requireLecturer, async (c) => {
      const q = await this.practice.get(c.req.param('id'));
      await this.sessions.getOwned(q.sessionId, c.get('user').id);
      await this.practice.remove(q.id);
      return c.json({ ok: true });
    });

    // Multipart {file, title?} for a file, JSON {url, title?} for a link.
    app.post('/sessions/:id/materials', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      if (c.req.header('content-type')?.startsWith('multipart/form-data')) {
        const body = await c.req.parseBody();
        const file = body.file;
        if (!(file instanceof File)) throw new ValidationError('file is required');
        if (file.size > MAX_MATERIAL_BYTES) throw new ValidationError('file is larger than 50 MB');
        const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '';
        const data = Buffer.from(await file.arrayBuffer());
        return c.json(materialDto(await this.materials.addFile(session, title, { data, filename: file.name.slice(0, 200), mimeType: file.type })), 201);
      }
      const b = await jsonBody(c.req);
      return c.json(materialDto(await this.materials.addLink(session, str(b, 'title', { max: 200, optional: true }), str(b, 'url', { max: 2000 }))), 201);
    });

    app.delete('/materials/:id', requireLecturer, async (c) => {
      const m = await this.materials.get(c.req.param('id'));
      await this.sessions.getOwned(m.sessionId, c.get('user').id);
      await this.materials.remove(m.id);
      return c.json({ ok: true });
    });

    return app;
  }
}
