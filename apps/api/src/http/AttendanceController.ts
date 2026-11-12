import { Hono } from 'hono';
import type { AttendanceService } from '../attendance/AttendanceService.js';
import type { CourseService } from '../attendance/CourseService.js';
import type { QrTokenService } from '../attendance/QrTokenService.js';
import type { SessionService } from '../attendance/SessionService.js';
import type { Clock } from '../infra/Clock.js';
import { ConflictError } from '../shared/errors.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { recordDto } from './dto.js';
import { geo, jsonBody, str } from './validate.js';

export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly sessions: SessionService,
    private readonly tokens: QrTokenService,
    private readonly courses: Pick<CourseService, 'requireMember'>,
    private readonly clock: Clock,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.post('/checkins', async (c) => {
      const user = c.get('user');
      if (!user.studentNumber) throw new ConflictError('ONBOARDING_REQUIRED', 'Student ID missing');
      const b = await jsonBody(c.req);
      const token = str(b, 'token', { max: 128 });
      const session = await this.sessions.get(this.tokens.parse(token).sessionId);
      const { record, alreadyCheckedIn } = await this.attendance.checkIn({
        session,
        studentId: user.id,
        studentNumber: user.studentNumber,
        studentName: user.name,
        deviceId: str(b, 'deviceId', { max: 64 }),
        token,
        location: geo(b, 'location'),
        now: this.clock.now(),
      });
      return c.json({ record: recordDto(record), alreadyCheckedIn, sessionTitle: session.title }, alreadyCheckedIn ? 200 : 201);
    });

    // A course member who is not in the room joins the live lesson from the app (listed as remote).
    app.post('/sessions/:id/join-remote', async (c) => {
      const user = c.get('user');
      if (!user.studentNumber) throw new ConflictError('ONBOARDING_REQUIRED', 'Student ID missing');
      const session = await this.sessions.get(c.req.param('id'));
      await this.courses.requireMember(session.courseId, user.studentNumber);
      const { record, alreadyCheckedIn } = await this.attendance.joinRemote({
        session,
        studentId: user.id,
        studentNumber: user.studentNumber,
        studentName: user.name,
        now: this.clock.now(),
      });
      return c.json({ record: recordDto(record), alreadyCheckedIn, sessionTitle: session.title }, alreadyCheckedIn ? 200 : 201);
    });

    app.post('/zoom-checkins', async (c) => {
      const user = c.get('user');
      if (!user.studentNumber) throw new ConflictError('ONBOARDING_REQUIRED', 'Student ID missing');
      const token = str(await jsonBody(c.req), 'token', { max: 128 });
      const session = await this.sessions.get(this.tokens.parseZoom(token));
      this.tokens.verifyZoom(token, session.qrSecret);
      const { record, alreadyCheckedIn } = await this.attendance.joinRemote({
        session,
        studentId: user.id,
        studentNumber: user.studentNumber,
        studentName: user.name,
        now: this.clock.now(),
      });
      return c.json({ record: recordDto(record), alreadyCheckedIn, sessionTitle: session.title }, alreadyCheckedIn ? 200 : 201);
    });

    app.delete('/attendance/:id', requireLecturer, async (c) => {
      const record = await this.attendance.get(c.req.param('id'));
      await this.sessions.getOwned(record.sessionId, c.get('user').id);
      const reason = c.req.query('reason')?.slice(0, 200) || 'הוסר ע״י המרצה';
      return c.json(recordDto(await this.attendance.remove(record.id, reason)));
    });

    return app;
  }
}
