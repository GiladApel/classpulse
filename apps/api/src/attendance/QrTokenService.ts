import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Clock } from '../infra/Clock.js';
import { DomainError } from '../shared/errors.js';

export interface TokenClaims {
  sessionId: string;
  window: number;
}

export class TokenError extends DomainError {
  constructor(code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED') {
    super(code, code);
  }
}

const TOKEN_RE = /^([a-z0-9]{1,32})\.([a-z0-9]{1,12})\.([A-Za-z0-9_-]{22})$/;

/** Token = sessionId.window(base36).HMAC; accepted in its own window and the next (acceptedWindows = 2). */
export class QrTokenService {
  constructor(
    private readonly clock: Clock,
    private readonly windowSec = 10,
    private readonly acceptedWindows = 2,
  ) {}

  currentWindow(): number {
    return Math.floor(this.clock.now().getTime() / (this.windowSec * 1000));
  }

  msUntilNextWindow(): number {
    const windowMs = this.windowSec * 1000;
    return windowMs - (this.clock.now().getTime() % windowMs);
  }

  issue(sessionId: string, secret: string): string {
    const window = this.currentWindow();
    return `${sessionId}.${window.toString(36)}.${this.sign(sessionId, window, secret)}`;
  }

  parse(token: string): TokenClaims {
    const m = TOKEN_RE.exec(token);
    if (!m) throw new TokenError('TOKEN_INVALID');
    return { sessionId: m[1], window: parseInt(m[2], 36) };
  }

  verify(token: string, secret: string): TokenClaims {
    const claims = this.parse(token);
    const given = Buffer.from(token.slice(token.lastIndexOf('.') + 1));
    const expected = Buffer.from(this.sign(claims.sessionId, claims.window, secret));
    if (!timingSafeEqual(given, expected)) throw new TokenError('TOKEN_INVALID');
    const age = this.currentWindow() - claims.window;
    if (age < 0) throw new TokenError('TOKEN_INVALID');
    if (age >= this.acceptedWindows) throw new TokenError('TOKEN_EXPIRED');
    return claims;
  }

  private sign(sessionId: string, window: number, secret: string): string {
    return createHmac('sha256', secret).update(`${sessionId}.${window}`).digest('base64url').slice(0, 22);
  }
}
