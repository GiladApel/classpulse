import { Hono } from 'hono';
import type { Container } from './container.js';
import { AttendanceController } from './http/AttendanceController.js';
import { type AppEnv, requireUser } from './http/auth.js';
import { ChallengeController } from './http/ChallengeController.js';
import { EngagementController } from './http/EngagementController.js';
import { handleError } from './http/errors.js';
import { PollController } from './http/PollController.js';
import { SessionController } from './http/SessionController.js';

export function createApp(c: Container): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.onError(handleError);
  app.get('/health', (ctx) => ctx.json({ ok: true }));

  app.use('*', requireUser(c.resolveUser));
  app.get('/config', (ctx) => ctx.json({ exportFormats: c.exports.formats() }));
  app.route('/sessions', new SessionController(c.sessions, c.attendance, c.exports).routes());
  app.route('/', new AttendanceController(c.attendance, c.sessions, c.tokens, c.clock).routes());
  app.route('/', new ChallengeController(c.challenges, c.sessions, c.attendance).routes());
  app.route('/', new EngagementController(c.sessions, c.confusion, c.feed).routes());
  app.route('/', new PollController(c.polls, c.sessions).routes());
  return app;
}
