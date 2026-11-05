import { DomainError } from '../shared/errors.js';
import type { ChallengeData, ChallengeStatus, ResponsePayload, Verdict } from './types.js';

export class ChallengeError extends DomainError {}

export interface AcceptContext {
  eligible: Set<string>;
  alreadyAnswered: boolean;
  now: Date;
}

export interface SubmittedResponse {
  studentNumber: string;
  payload: ResponsePayload;
}

/**
 * Template Method: start/accept/close fix the lifecycle (State: pending → active → closed);
 * subclasses supply validatePayload and evaluate.
 */
export abstract class Challenge {
  constructor(protected readonly data: ChallengeData) {}

  get state(): Readonly<ChallengeData> {
    return this.data;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.data.expiresAt.getTime();
  }

  start(now: Date, durationSec: number): void {
    this.assertState('pending');
    this.data.startedAt = now;
    this.data.expiresAt = new Date(now.getTime() + durationSec * 1000);
    this.data.status = 'active';
  }

  accept(r: SubmittedResponse, ctx: AcceptContext): void {
    this.assertState('active');
    if (this.isExpired(ctx.now)) throw new ChallengeError('CHALLENGE_EXPIRED', 'הזמן לבדיקה הסתיים');
    if (!ctx.eligible.has(r.studentNumber)) throw new ChallengeError('NOT_ELIGIBLE', 'הבדיקה מיועדת לסטודנטים שסימנו נוכחות');
    if (ctx.alreadyAnswered) throw new ChallengeError('ALREADY_ANSWERED', 'כבר ענית על הבדיקה');
    this.validatePayload(r.payload, ctx.now);
  }

  /** `force` lets the lecturer close before the timer. */
  close(responses: SubmittedResponse[], eligible: string[], now: Date, force = false): Map<string, Verdict> {
    this.assertState('active');
    if (!force && !this.isExpired(now)) throw new ChallengeError('CHALLENGE_RUNNING', 'Challenge is still running');
    this.data.status = 'closed';
    const verdicts = this.evaluate(responses);
    for (const student of eligible) if (!verdicts.has(student)) verdicts.set(student, 'no_response');
    return verdicts;
  }

  protected assertState(expected: ChallengeStatus): void {
    if (this.data.status !== expected) {
      throw new ChallengeError('CHALLENGE_STATE', `Challenge is ${this.data.status}, expected ${expected}`);
    }
  }

  protected abstract validatePayload(payload: ResponsePayload, now: Date): void;
  protected abstract evaluate(responses: SubmittedResponse[]): Map<string, Verdict>;
}
