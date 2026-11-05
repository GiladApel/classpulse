import { type CheckInContext, type CheckInRule, pass, reject, type RuleResult } from './CheckInRule.js';
import { type QrTokenService, TokenError } from './QrTokenService.js';

export class TokenRule implements CheckInRule {
  constructor(private readonly tokens: QrTokenService) {}

  async check(ctx: CheckInContext): Promise<RuleResult> {
    try {
      const claims = this.tokens.verify(ctx.token, ctx.session.qrSecret);
      if (claims.sessionId !== ctx.session.id) return reject('TOKEN_INVALID', 'קוד לא תקין');
      return pass();
    } catch (e) {
      if (!(e instanceof TokenError)) throw e;
      return reject(e.code, e.message);
    }
  }
}
