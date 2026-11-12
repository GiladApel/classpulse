import { createMiddleware } from 'hono/factory';
import type { UserIdentity } from '../infra/pb/pbClient.js';
import { ForbiddenError } from '../shared/errors.js';

export type AppEnv = { Variables: { user: UserIdentity } };
export type UserResolver = (token: string) => Promise<UserIdentity | null>;

export const requireUser = (resolve: UserResolver) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
    const user = token ? await resolve(token) : null;
    if (!user) return c.json({ code: 'UNAUTHENTICATED', message: 'Sign in required' }, 401);
    c.set('user', user);
    await next();
  });

export const requireAdmin = (isAdmin: (email: string) => boolean) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!isAdmin(c.get('user').email)) throw new ForbiddenError('Admins only');
    await next();
  });

export const requireLecturer = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'lecturer') throw new ForbiddenError('Lecturers only');
  await next();
});
