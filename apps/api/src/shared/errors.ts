export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super('NOT_FOUND', `${what} not found`);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message);
  }
}

export class ConflictError extends DomainError {}
