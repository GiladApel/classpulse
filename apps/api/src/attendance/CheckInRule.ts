import type { GeoPoint, Session } from './types.js';

export type RuleKind = 'pass' | 'warn' | 'reject';

export interface RuleResult {
  kind: RuleKind;
  code: string;
  message?: string;
  data?: { distanceM?: number; recordId?: string };
}

export interface CheckInContext {
  session: Session;
  studentId: string;
  studentNumber: string;
  studentName: string;
  deviceId: string;
  token: string;
  location?: GeoPoint;
  now: Date;
}

export interface CheckInRule {
  check(ctx: CheckInContext): Promise<RuleResult>;
}

export const pass = (data?: RuleResult['data']): RuleResult => ({ kind: 'pass', code: 'OK', data });

export const reject = (code: string, message: string, data?: RuleResult['data']): RuleResult => ({
  kind: 'reject',
  code,
  message,
  data,
});
