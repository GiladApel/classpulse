import { Hono } from 'hono';
import type { Container } from './container.js';
import { AdminController } from './http/AdminController.js';
import { AttendanceController } from './http/AttendanceController.js';
import { type AppEnv, requireUser } from './http/auth.js';
import { ChallengeController } from './http/ChallengeController.js';
import { ContentController } from './http/ContentController.js';
import { EngagementController } from './http/EngagementController.js';
import { handleError } from './http/errors.js';
import { HomeworkController } from './http/HomeworkController.js';
import { LectureContentController } from './http/LectureContentController.js';
import { PollController } from './http/PollController.js';
import { SessionController } from './http/SessionController.js';

export function createApp(c: Container): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.onError(handleError);
  app.get('/health', (ctx) => ctx.json({ ok: true }));

  app.use('*', requireUser(c.resolveUser));
  app.get('/config', (ctx) => ctx.json({ exportFormats: c.exports.formats() }));
  app.route('/', new AdminController(c.admins, c.courses).routes());
  app.route('/sessions', new SessionController(c.sessions, c.attendance, c.exports).routes());
  app.route('/', new AttendanceController(c.attendance, c.sessions, c.tokens, c.courses, c.clock).routes());
  app.route('/', new ChallengeController(c.challenges, c.sessions, c.attendance).routes());
  app.route('/', new EngagementController(c.sessions, c.confusion, c.feed, c.feedback).routes());
  app.route('/', new PollController(c.polls, c.sessions).routes());
  app.route('/', new ContentController(c.recordings, c.sessions).routes());
  app.route('/', new HomeworkController(c.homework, c.sessions).routes());
  app.route('/', new LectureContentController(c.practice, c.materials, c.sessions).routes());
  return app;
}
