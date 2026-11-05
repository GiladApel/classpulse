import { type CheckInContext, type CheckInRule, pass, reject, type RuleResult } from './CheckInRule.js';
import type { AttendanceRepository } from './repositories.js';

export class DeviceBindingRule implements CheckInRule {
  constructor(private readonly repo: AttendanceRepository) {}

  async check(ctx: CheckInContext): Promise<RuleResult> {
    if (!ctx.deviceId) return reject('DEVICE_MISSING', 'לא זוהה מכשיר');
    const used = await this.repo.findBySessionAndDevice(ctx.session.id, ctx.deviceId);
    if (used && used.studentNumber !== ctx.studentNumber) {
      return reject('DEVICE_IN_USE', 'המכשיר הזה כבר סימן נוכחות לסטודנט אחר בשיעור זה');
    }
    return pass();
  }
}
