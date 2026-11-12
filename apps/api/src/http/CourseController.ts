import { Hono } from 'hono';
import type { CourseService, SlotInput } from '../attendance/CourseService.js';
import type { SessionService } from '../attendance/SessionService.js';
import type { CourseSlot, Enrollment } from '../attendance/types.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { ValidationError } from './errors.js';
import { jsonBody, num, str } from './validate.js';

export const MAX_ROSTER_BYTES = 5 * 1024 * 1024;

const enrollmentDto = (e: Enrollment) => ({ studentNumber: e.studentNumber, name: e.name });
const slotDto = (s: CourseSlot) => ({ id: s.id, weekday: s.weekday, starts: s.starts, ends: s.ends, room: s.room });

const optionalDate = (body: Record<string, unknown>, key: string): Date | undefined => {
  const v = body[key];
  if (v === undefined || v === null || v === '') return undefined;
  const d = typeof v === 'string' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new ValidationError(`${key} must be a date`);
  return d;
};

/** The lecturer's course setup: create a course, its roster and its weekly timetable. */
export class CourseController {
  constructor(
    private readonly courses: CourseService,
    private readonly sessions: SessionService,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.post('/courses', requireLecturer, async (c) => {
      const b = await jsonBody(c.req);
      const course = await this.courses.create(c.get('user').id, str(b, 'code', { max: 20 }), str(b, 'name', { max: 120 }));
      return c.json({ id: course.id, code: course.code, name: course.name }, 201);
    });

    // Multipart {file} for an Excel/CSV file, JSON {text} for a pasted list.
    app.post('/courses/:id/roster', requireLecturer, async (c) => {
      const course = await this.sessions.getOwnedCourse(c.req.param('id'), c.get('user').id);
      if (c.req.header('content-type')?.startsWith('multipart/form-data')) {
        const file = (await c.req.parseBody()).file;
        if (!(file instanceof File) || file.size === 0) throw new ValidationError('file is required');
        if (file.size > MAX_ROSTER_BYTES) throw new ValidationError('file is too large');
        return c.json(await this.courses.importRoster(course, { file: Buffer.from(await file.arrayBuffer()) }));
      }
      return c.json(await this.courses.importRoster(course, { text: str(await jsonBody(c.req), 'text', { max: 200_000 }) }));
    });

    app.post('/courses/:id/enrollments', requireLecturer, async (c) => {
      const course = await this.sessions.getOwnedCourse(c.req.param('id'), c.get('user').id);
      const b = await jsonBody(c.req);
      const e = await this.courses.enroll(course, str(b, 'studentNumber', { max: 20 }), str(b, 'name', { max: 80, optional: true }));
      return c.json(enrollmentDto(e), 201);
    });

    app.delete('/courses/:id/enrollments/:studentNumber', requireLecturer, async (c) => {
      const course = await this.sessions.getOwnedCourse(c.req.param('id'), c.get('user').id);
      await this.courses.unenroll(course, c.req.param('studentNumber'));
      return c.json({ ok: true });
    });

    app.put('/courses/:id/timetable', requireLecturer, async (c) => {
      const course = await this.sessions.getOwnedCourse(c.req.param('id'), c.get('user').id);
      const b = await jsonBody(c.req);
      if (!Array.isArray(b.slots)) throw new ValidationError('slots must be a list');
      const slots: SlotInput[] = b.slots.map((s: unknown) => {
        if (!s || typeof s !== 'object') throw new ValidationError('a slot must be an object');
        const o = s as Record<string, unknown>;
        return { weekday: num(o, 'weekday', 0, 6), starts: str(o, 'starts', { max: 5 }), ends: str(o, 'ends', { max: 5 }), room: str(o, 'room', { max: 40, optional: true }) };
      });
      const saved = await this.courses.setTimetable(course, slots, { start: optionalDate(b, 'termStart'), end: optionalDate(b, 'termEnd') });
      return c.json({ slots: saved.map(slotDto) });
    });

    return app;
  }
}
