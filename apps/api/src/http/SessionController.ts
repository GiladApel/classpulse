import { Hono } from 'hono';
import type { AttendanceExportService } from '../attendance/AttendanceExportService.js';
import type { AttendanceService } from '../attendance/AttendanceService.js';
import type { SessionService } from '../attendance/SessionService.js';
import type { ExportFormat } from '../infra/export/SpreadsheetExporter.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { recordDto, sessionDto } from './dto.js';
import { geo, jsonBody, num, oneOf, str } from './validate.js';

const FORMATS = ['xlsx', 'csv', 'sheets'] as const satisfies readonly ExportFormat[];

/** Lecturer-only session endpoints. */
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly attendance: AttendanceService,
    private readonly exports: AttendanceExportService,
  ) {}

  routes(): Hono<AppEnv> {
    // Guard per route: a blanket app.use() here would also cover other controllers' /sessions/:id/* student routes.
    const app = new Hono<AppEnv>();

    app.post('/', requireLecturer, async (c) => {
      const b = await jsonBody(c.req);
      const session = await this.sessions.start(c.get('user').id, {
        courseId: str(b, 'courseId'),
        title: str(b, 'title', { max: 120 }),
        location: geo(b, 'location'),
        geofenceMode: oneOf(b, 'geofenceMode', ['lenient', 'strict'] as const),
        geofenceRadiusM: num(b, 'geofenceRadiusM', 10, 2000),
      });
      return c.json(sessionDto(session), 201);
    });

    app.post('/:id/end', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      return c.json(sessionDto(await this.sessions.end(session)));
    });

    app.get('/:id/qr', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      return c.json(this.sessions.currentQrToken(session));
    });

    app.post('/:id/attendance', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      const b = await jsonBody(c.req);
      const record = await this.attendance.manualApprove(
        session,
        str(b, 'studentNumber', { max: 20 }),
        str(b, 'studentName', { max: 80 }),
        str(b, 'note', { max: 200, optional: true }),
      );
      return c.json(recordDto(record), 201);
    });

    app.get('/:id/export', requireLecturer, async (c) => {
      const session = await this.sessions.getOwned(c.req.param('id'), c.get('user').id);
      const format = oneOf({ format: c.req.query('format') }, 'format', FORMATS);
      const out = await this.exports.export(session, format);
      if (out.kind === 'link') return c.json({ url: out.url });
      return c.body(new Uint8Array(out.data), 200, {
        'Content-Type': out.contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
      });
    });

    return app;
  }
}
