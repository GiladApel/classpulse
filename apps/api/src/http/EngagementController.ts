import { Hono } from 'hono';
import type { SessionService } from '../attendance/SessionService.js';
import type { ConfusionMeter } from '../engagement/ConfusionMeter.js';
import type { FeedbackService } from '../engagement/FeedbackService.js';
import type { FeedService } from '../engagement/FeedService.js';
import { FEEDBACK_RATINGS, type FeedPost, type Participant } from '../engagement/types.js';
import type { UserIdentity } from '../infra/pb/pbClient.js';
import { ConflictError } from '../shared/errors.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { ValidationError } from './errors.js';
import { jsonBody, oneOf, str } from './validate.js';

/** Never exposes the author of a post. */
export const postDto = (p: FeedPost) => ({
  id: p.id,
  courseId: p.courseId,
  sessionId: p.sessionId ?? null,
  displayName: p.displayName,
  anonymous: p.anonymous,
  text: p.text,
  votes: p.votes,
  answered: p.answered,
  answer: p.answer,
  postedAt: p.postedAt.toISOString(),
});

export function participant(user: UserIdentity): Participant {
  if (!user.studentNumber) throw new ConflictError('ONBOARDING_REQUIRED', 'Student ID missing');
  return { id: user.id, studentNumber: user.studentNumber, name: user.name };
}

export class EngagementController {
  constructor(
    private readonly sessions: SessionService,
    private readonly confusion: ConfusionMeter,
    private readonly feed: FeedService,
    private readonly feedback: FeedbackService,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.post('/sessions/:id/lost', async (c) => {
      const session = await this.sessions.get(c.req.param('id'));
      return c.json(await this.confusion.record(session, participant(c.get('user'))));
    });

    app.get('/sessions/:id/confusion', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      return c.json(await this.confusion.level(session.id));
    });

    app.post('/sessions/:id/posts', async (c) => {
      const session = await this.sessions.get(c.req.param('id'));
      const b = await jsonBody(c.req);
      const text = str(b, 'text', { max: 500 });
      if (b.anonymous !== undefined && typeof b.anonymous !== 'boolean') throw new ValidationError('anonymous must be a boolean');
      return c.json(postDto(await this.feed.post(session, participant(c.get('user')), text, b.anonymous === true)), 201);
    });

    // The course forum: any course member, during or between lessons.
    app.post('/courses/:id/posts', async (c) => {
      const course = await this.sessions.getCourse(c.req.param('id'));
      const b = await jsonBody(c.req);
      const text = str(b, 'text', { max: 500 });
      if (b.anonymous !== undefined && typeof b.anonymous !== 'boolean') throw new ValidationError('anonymous must be a boolean');
      return c.json(postDto(await this.feed.postToCourse(course, participant(c.get('user')), text, b.anonymous === true)), 201);
    });

    app.post('/posts/:id/votes', async (c) => {
      await this.feed.upvote(c.req.param('id'), participant(c.get('user')));
      return c.json({ ok: true }, 201);
    });

    app.post('/posts/:id/answered', requireLecturer, async (c) => {
      const post = await this.feed.get(c.req.param('id'));
      await this.sessions.getOwnedCourse(post.courseId, c.get('user').id);
      const b = await jsonBody(c.req);
      if (typeof b.answered !== 'boolean') throw new ValidationError('answered must be a boolean');
      return c.json(postDto(await this.feed.markAnswered(post.id, b.answered)));
    });

    app.post('/posts/:id/answer', requireLecturer, async (c) => {
      const post = await this.feed.get(c.req.param('id'));
      await this.sessions.getOwnedCourse(post.courseId, c.get('user').id);
      const b = await jsonBody(c.req);
      return c.json(postDto(await this.feed.answer(post.id, str(b, 'text', { max: 2000, optional: true }))));
    });

    app.get('/sessions/:id/feedback/status', async (c) => {
      const session = await this.sessions.get(c.req.param('id'));
      const s = await this.feedback.status(session, participant(c.get('user')));
      return c.json({ ...s, closesAt: s.closesAt?.toISOString() ?? null });
    });

    app.post('/sessions/:id/feedback', async (c) => {
      const session = await this.sessions.get(c.req.param('id'));
      const b = await jsonBody(c.req);
      await this.feedback.submit(session, participant(c.get('user')), oneOf(b, 'rating', FEEDBACK_RATINGS), str(b, 'comment', { max: 1000, optional: true }));
      return c.json({ ok: true }, 201);
    });

    app.get('/sessions/:id/feedback', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      return c.json(await this.feedback.summary(session.id));
    });

    app.post('/sessions/:id/themes', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      return c.json({ themes: await this.feed.clusterOpen(session.id) });
    });

    return app;
  }
}
