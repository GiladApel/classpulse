import { Hono } from 'hono';
import type { AttendanceService } from '../attendance/AttendanceService.js';
import type { SessionService } from '../attendance/SessionService.js';
import type { ChallengeManager } from '../challenge/ChallengeManager.js';
import type { ChallengeData, Headcount } from '../challenge/types.js';
import { ConflictError } from '../shared/errors.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { recordDto } from './dto.js';
import { ValidationError } from './errors.js';
import { jsonBody, num, oneOf, str } from './validate.js';

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const headcountDto = (h: Headcount) => ({
  id: h.id,
  peopleCount: h.peopleCount,
  confidence: h.confidence,
  boxes: h.boxes,
  checkinsAtSnap: h.checkinsAtSnap,
});

/** Never includes the roll-call secret. */
export const challengeDto = (c: ChallengeData) => ({
  id: c.id,
  sessionId: c.sessionId,
  headcountId: c.headcountId ?? null,
  type: c.type,
  status: c.status,
  startedAt: c.startedAt.toISOString(),
  expiresAt: c.expiresAt.toISOString(),
});

export class ChallengeController {
  constructor(
    private readonly challenges: ChallengeManager,
    private readonly sessions: SessionService,
    private readonly attendance: AttendanceService,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.post('/sessions/:id/headcounts', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      const body = await c.req.parseBody();
      const photo = body.photo;
      if (!(photo instanceof File)) throw new ValidationError('photo file is required');
      if (photo.size > MAX_PHOTO_BYTES) throw new ValidationError('photo is larger than 15 MB');
      if (!photo.type.startsWith('image/')) throw new ValidationError('photo must be an image');
      const result = await this.challenges.snapHeadcount(session, { mimeType: photo.type, data: Buffer.from(await photo.arrayBuffer()) });
      return c.json({ ...result, headcount: headcountDto(result.headcount) }, 201);
    });

    app.post('/sessions/:id/challenges', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      const b = await jsonBody(c.req);
      const type = oneOf(b, 'type', ['rollcall', 'visual_ping'] as const);
      const headcountId = str(b, 'headcountId', { optional: true }) || undefined;
      return c.json(challengeDto(await this.challenges.launch(session, type, headcountId)), 201);
    });

    app.get('/challenges/:id/qr', requireLecturer, async (c) => {
      const challenge = await this.ownedChallenge(c.req.param('id'), c.get('user').id);
      return c.json(this.challenges.rollcallToken(challenge));
    });

    app.post('/challenges/:id/close', requireLecturer, async (c) => {
      const challenge = await this.ownedChallenge(c.req.param('id'), c.get('user').id);
      const verdicts = await this.challenges.close(challenge.id, true);
      return c.json({ verdicts: Object.fromEntries(verdicts) });
    });

    app.post('/challenges/:id/responses', async (c) => {
      const user = c.get('user');
      if (!user.studentNumber) throw new ConflictError('ONBOARDING_REQUIRED', 'Student ID missing');
      const b = await jsonBody(c.req);
      const tap = b.tap && typeof b.tap === 'object' ? { x: num(b.tap as Record<string, unknown>, 'x', 0, 1), y: num(b.tap as Record<string, unknown>, 'y', 0, 1) } : undefined;
      const token = str(b, 'token', { max: 128, optional: true }) || undefined;
      await this.challenges.submitResponse(c.req.param('id'), { id: user.id, studentNumber: user.studentNumber }, { tap, token });
      return c.json({ ok: true }, 201);
    });

    app.post('/attendance/:id/confirm', requireLecturer, async (c) => {
      const record = await this.attendance.get(c.req.param('id'));
      await this.sessions.getOwned(record.sessionId, c.get('user').id);
      return c.json(recordDto(await this.attendance.confirm(record.id)));
    });

    return app;
  }

  private async ownedChallenge(challengeId: string, lecturerId: string): Promise<ChallengeData> {
    const challenge = await this.challenges.get(challengeId);
    await this.sessions.getOwned(challenge.sessionId, lecturerId);
    return challenge;
  }
}
