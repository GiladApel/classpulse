import { Hono } from 'hono';
import type { UserAdminService } from '../admin/UserAdminService.js';
import type { ManagedUser } from '../admin/types.js';
import type { CourseService } from '../attendance/CourseService.js';
import { type AppEnv, requireAdmin, requireLecturer } from './auth.js';
import { jsonBody, oneOf, str } from './validate.js';

const userDto = (u: ManagedUser) => ({ id: u.id, name: u.name, email: u.email, studentNumber: u.studentNumber, role: u.role });

/** Who am I, the admin's user list and role changes, and lecturers creating their own courses. */
export class AdminController {
  constructor(
    private readonly admins: UserAdminService,
    private readonly courses: CourseService,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    const adminOnly = requireAdmin((email) => this.admins.isAdmin(email));

    app.get('/me', (c) => c.json({ admin: this.admins.isAdmin(c.get('user').email) }));

    app.get('/admin/users', adminOnly, async (c) => {
      const q = (c.req.query('q') ?? '').slice(0, 100);
      return c.json({ users: (await this.admins.search(q)).map(userDto) });
    });

    app.post('/admin/users/:id/role', adminOnly, async (c) => {
      const role = oneOf(await jsonBody(c.req), 'role', ['student', 'lecturer'] as const);
      return c.json(userDto(await this.admins.setRole(c.get('user').id, c.req.param('id'), role)));
    });

    app.post('/courses', requireLecturer, async (c) => {
      const b = await jsonBody(c.req);
      const course = await this.courses.create(c.get('user').id, str(b, 'code', { max: 20 }), str(b, 'name', { max: 120 }));
      return c.json({ id: course.id, code: course.code, name: course.name }, 201);
    });

    return app;
  }
}
