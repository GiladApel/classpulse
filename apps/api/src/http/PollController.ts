import { Hono } from 'hono';
import type { SessionService } from '../attendance/SessionService.js';
import type { PollService } from '../engagement/PollService.js';
import type { Poll } from '../engagement/types.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { participant } from './EngagementController.js';
import { ValidationError } from './errors.js';
import { jsonBody, num, oneOf, str } from './validate.js';

const MAX_SLIDE_BYTES = 10 * 1024 * 1024;

/** For the lecturer: includes the correct answer, which students only see after close. */
export const pollDto = (p: Poll) => ({
  id: p.id,
  sessionId: p.sessionId,
  question: p.question,
  options: p.options,
  correctIndex: p.correctIndex,
  status: p.status,
  source: p.source,
  results: p.results,
});

export class PollController {
  constructor(
    private readonly polls: PollService,
    private readonly sessions: SessionService,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    // Multipart: "slide" (image).
    app.post('/polls/drafts', requireLecturer, async (c) => {
      const slide = (await c.req.parseBody()).slide;
      if (!(slide instanceof File)) throw new ValidationError('slide image is required');
      if (slide.size > MAX_SLIDE_BYTES) throw new ValidationError('slide is larger than 10 MB');
      if (!slide.type.startsWith('image/')) throw new ValidationError('slide must be an image');
      return c.json({ drafts: await this.polls.draftFromSlide({ mimeType: slide.type, data: Buffer.from(await slide.arrayBuffer()) }) });
    });

    // {question, options, correctIndex?, source?}; "open: true" launches it at once.
    app.post('/sessions/:id/polls', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      const b = await jsonBody(c.req);
      const question = str(b, 'question', { max: 300 });
      if (!Array.isArray(b.options) || !b.options.every((o) => typeof o === 'string' && o.length <= 120)) {
        throw new ValidationError('options must be an array of strings (≤120 chars)');
      }
      const correctIndex = b.correctIndex === undefined || b.correctIndex === null ? null : num(b, 'correctIndex', 0, 5);
      const source = b.source === undefined ? 'manual' : oneOf(b, 'source', ['manual', 'ai'] as const);
      let poll = await this.polls.create(session, { question, options: b.options as string[], correctIndex }, source);
      if (b.open === true) poll = await this.polls.open(session, poll.id);
      return c.json(pollDto(poll), 201);
    });

    app.post('/polls/:id/open', requireLecturer, async (c) => {
      const poll = await this.polls.get(c.req.param('id'));
      const session = await this.sessions.getOwned(poll.sessionId, c.get('user').id);
      return c.json(pollDto(await this.polls.open(session, poll.id)));
    });

    app.post('/polls/:id/close', requireLecturer, async (c) => {
      const poll = await this.polls.get(c.req.param('id'));
      await this.sessions.getOwned(poll.sessionId, c.get('user').id);
      return c.json(await this.polls.close(poll.id));
    });

    app.post('/polls/:id/votes', async (c) => {
      const b = await jsonBody(c.req);
      await this.polls.vote(c.req.param('id'), participant(c.get('user')), num(b, 'optionIndex', 0, 5));
      return c.json({ ok: true }, 201);
    });

    return app;
  }
}
