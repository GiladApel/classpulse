import type { AttendanceService } from '../attendance/AttendanceService.js';
import type { Session } from '../attendance/types.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError } from '../shared/errors.js';
import type { LostSignalRepository } from './repositories.js';
import type { ConfusionLevel, Participant, TimePoint } from './types.js';

export interface LostOutcome {
  accepted: boolean;
  /** Seconds until this student may signal again. */
  retryInSec: number;
}

export class ConfusionMeter {
  constructor(
    private readonly signals: LostSignalRepository,
    private readonly attendance: Pick<AttendanceService, 'requireParticipant' | 'presentCount'>,
    private readonly clock: Clock,
    private readonly cooldownSec = 60,
  ) {}

  /** One signal per student per cooldown; a repeat inside the cooldown is ignored, not an error. */
  async record(session: Session, student: Participant): Promise<LostOutcome> {
    if (session.status !== 'active') throw new DomainError('SESSION_ENDED', 'השיעור כבר הסתיים');
    await this.attendance.requireParticipant(session.id, student.studentNumber);
    const now = this.clock.now();
    const last = await this.signals.lastFor(session.id, student.studentNumber);
    const sinceMs = last ? now.getTime() - last.at.getTime() : Infinity;
    if (sinceMs < this.cooldownSec * 1000) {
      return { accepted: false, retryInSec: Math.ceil((this.cooldownSec * 1000 - sinceMs) / 1000) };
    }
    await this.signals.create({ sessionId: session.id, studentId: student.id, studentNumber: student.studentNumber, at: now });
    return { accepted: true, retryInSec: this.cooldownSec };
  }

  async level(sessionId: string, windowSec = 120): Promise<ConfusionLevel> {
    const since = new Date(this.clock.now().getTime() - windowSec * 1000);
    const [recent, present] = await Promise.all([this.signals.listSince(sessionId, since), this.attendance.presentCount(sessionId)]);
    const lost = new Set(recent.map((s) => s.studentNumber)).size;
    return { lost, present, ratio: present > 0 ? Math.min(1, lost / present) : 0, windowSec };
  }

  /** Distinct students per bucket from `from` onward; empty buckets included so the timeline has no gaps. */
  async series(sessionId: string, from: Date, to: Date, bucketSec = 60): Promise<TimePoint[]> {
    const signals = await this.signals.listSince(sessionId, from);
    const n = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (bucketSec * 1000)));
    const buckets = Array.from({ length: n }, () => new Set<string>());
    for (const s of signals) {
      const i = Math.floor((s.at.getTime() - from.getTime()) / (bucketSec * 1000));
      if (i >= 0 && i < n) buckets[i].add(s.studentNumber);
    }
    return buckets.map((set, i) => ({ t: new Date(from.getTime() + i * bucketSec * 1000), count: set.size }));
  }
}
