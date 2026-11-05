import { type CheckInContext, type CheckInRule, pass, reject, type RuleResult } from './CheckInRule.js';
import type { AttendanceRepository } from './repositories.js';

export class DuplicateStudentRule implements CheckInRule {
  constructor(private readonly repo: AttendanceRepository) {}

  async check(ctx: CheckInContext): Promise<RuleResult> {
    const existing = await this.repo.findBySessionAndStudentNumber(ctx.session.id, ctx.studentNumber);
    if (!existing) return pass();
    if (existing.status === 'removed') return reject('REMOVED', 'הנוכחות שלך הוסרה על ידי המרצה — פנו אליו');
    return reject('ALREADY_CHECKED_IN', 'כבר סימנת נוכחות', { recordId: existing.id });
  }
}
