import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { CheckInRejected } from '../attendance/AttendanceService.js';
import { TokenError } from '../attendance/QrTokenService.js';
import { DomainError, ForbiddenError, NotFoundError } from '../shared/errors.js';

export class ValidationError extends DomainError {
  constructor(message: string) {
    super('VALIDATION', message);
  }
}

export function handleError(err: Error, c: Context) {
  const status: ContentfulStatusCode =
    err instanceof ValidationError || err instanceof TokenError ? 400
    : err instanceof ForbiddenError ? 403
    : err instanceof NotFoundError ? 404
    : err instanceof CheckInRejected ? 422
    : err instanceof DomainError ? 409
    : 500;
  if (status === 500) {
    console.error(err);
    return c.json({ code: 'INTERNAL', message: 'Unexpected error' }, 500);
  }
  return c.json({ code: (err as DomainError).code, message: err.message }, status);
}
