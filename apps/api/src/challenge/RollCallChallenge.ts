import type { QrTokenService } from '../attendance/QrTokenService.js';
import { TokenError } from '../attendance/QrTokenService.js';
import { Challenge, ChallengeError, type SubmittedResponse } from './Challenge.js';
import type { ChallengeData, ResponsePayload, Verdict } from './types.js';

/** A fresh rotating QR only people in the room can scan in time; uses the challenge's own secret. */
export class RollCallChallenge extends Challenge {
  constructor(
    data: ChallengeData,
    private readonly tokens: QrTokenService,
  ) {
    super(data);
  }

  currentToken(): string {
    return this.tokens.issue(this.data.id, this.data.secret);
  }

  protected validatePayload(payload: ResponsePayload): void {
    if (!payload.token) throw new ChallengeError('TOKEN_INVALID', 'יש לסרוק את הקוד שעל הלוח');
    try {
      const claims = this.tokens.verify(payload.token, this.data.secret);
      if (claims.sessionId !== this.data.id) throw new TokenError('TOKEN_INVALID');
    } catch (e) {
      if (!(e instanceof TokenError)) throw e;
      throw new ChallengeError(e.code, e.code === 'TOKEN_EXPIRED' ? 'הקוד פג תוקף — סרקו שוב' : 'קוד לא תקין');
    }
  }

  protected evaluate(responses: SubmittedResponse[]): Map<string, Verdict> {
    return new Map(responses.map((r) => [r.studentNumber, 'ok' as Verdict]));
  }
}
