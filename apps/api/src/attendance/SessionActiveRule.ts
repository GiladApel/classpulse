import { type CheckInContext, type CheckInRule, pass, reject, type RuleResult } from './CheckInRule.js';

export class SessionActiveRule implements CheckInRule {
  async check(ctx: CheckInContext): Promise<RuleResult> {
    return ctx.session.status === 'active' ? pass() : reject('SESSION_ENDED', 'השיעור כבר הסתיים');
  }
}
