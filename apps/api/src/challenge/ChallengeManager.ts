import { randomBytes } from 'node:crypto';
import type { InlineAttachment } from '../ai/LLMProvider.js';
import type { Detection, PeopleDetector } from '../ai/PeopleDetector.js';
import type { AttendanceService } from '../attendance/AttendanceService.js';
import type { QrTokenService } from '../attendance/QrTokenService.js';
import type { AttendanceRecord, Session } from '../attendance/types.js';
import type { Clock } from '../infra/Clock.js';
import type { ImageProcessor } from '../infra/ImageProcessor.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { type Challenge, ChallengeError, type SubmittedResponse } from './Challenge.js';
import { ChallengeFactory } from './ChallengeFactory.js';
import type { ChallengeRepository, ChallengeResponseRepository, HeadcountRepository } from './repositories.js';
import { RollCallChallenge } from './RollCallChallenge.js';
import type { ChallengeData, ChallengeType, Headcount, ResponsePayload, Verdict } from './types.js';

export interface HeadcountResult {
  headcount: Headcount;
  presentCount: number;
  mismatch: boolean;
  detectionFailed: boolean;
}

export interface ChallengeOptions {
  blurSigma: number;
  /** Check-ins may exceed the photo count by this fraction (min 1 person) before we call it a mismatch. */
  mismatchTolerance: number;
  durationSec: Record<ChallengeType, number>;
}

const DEFAULTS: ChallengeOptions = { blurSigma: 30, mismatchTolerance: 0.1, durationSec: { rollcall: 30, visual_ping: 45 } };

const FLAG_REASON: Partial<Record<Verdict, string>> = {
  empty_seat: 'בדיקה ויזואלית: הקשה על מקום ריק',
  collision: 'בדיקה ויזואלית: אותו מקום כמו סטודנט אחר',
  no_response: 'לא הגיב לבדיקת נוכחות',
};

/** Application service orchestrating headcount → challenge → verdicts → attendance flags. */
export class ChallengeManager {
  private readonly opts: ChallengeOptions;

  constructor(
    private readonly detector: PeopleDetector,
    private readonly images: ImageProcessor,
    private readonly headcounts: HeadcountRepository,
    private readonly challenges: ChallengeRepository,
    private readonly responses: ChallengeResponseRepository,
    private readonly attendance: AttendanceService,
    private readonly tokens: QrTokenService,
    private readonly clock: Clock,
    opts: Partial<ChallengeOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  async snapHeadcount(session: Session, photo: InlineAttachment): Promise<HeadcountResult> {
    const normalized = await this.images.normalize(photo.data);
    const [presentCount, detection, blurred] = await Promise.all([
      this.attendance.presentCount(session.id),
      this.detector.detect({ mimeType: 'image/jpeg', data: normalized }).catch((e: unknown): Detection | null => {
        console.warn('People detection failed:', e instanceof Error ? e.message : e);
        return null;
      }),
      this.images.blur(normalized, this.opts.blurSigma),
    ]);

    const headcount = await this.headcounts.create(
      {
        sessionId: session.id,
        peopleCount: detection?.count ?? null,
        confidence: detection?.confidence ?? 0,
        boxes: detection?.boxes ?? [],
        checkinsAtSnap: presentCount,
        createdAt: this.clock.now(),
      },
      { photo: normalized, blurred },
    );
    const allowance = detection ? Math.max(1, Math.round(detection.count * this.opts.mismatchTolerance)) : 0;
    const mismatch = !!detection && presentCount > detection.count + allowance;
    return { headcount, presentCount, mismatch, detectionFailed: !detection };
  }

  async launch(session: Session, type: ChallengeType, headcountId?: string): Promise<ChallengeData> {
    if (session.status !== 'active') throw new ConflictError('SESSION_ENDED', 'השיעור הסתיים');
    if (await this.challenges.findActiveBySession(session.id)) throw new ConflictError('CHALLENGE_ACTIVE', 'כבר רצה בדיקה');

    const headcount = headcountId ? await this.headcounts.get(headcountId) : null;
    if (headcountId && (!headcount || headcount.sessionId !== session.id)) throw new NotFoundError('Headcount');

    const now = this.clock.now();
    const data: ChallengeData = {
      id: '',
      sessionId: session.id,
      headcountId: headcount?.id,
      type,
      status: 'pending',
      startedAt: now,
      expiresAt: now,
      secret: randomBytes(32).toString('base64url'),
    };
    const challenge = ChallengeFactory.create(data, { tokens: this.tokens, headcount });
    challenge.start(now, this.opts.durationSec[type]);

    const { id: _, ...toSave } = challenge.state;
    const image = type === 'visual_ping' && headcount ? await this.headcounts.getBlurred(headcount.id) : undefined;
    return this.challenges.create(toSave, image);
  }

  async submitResponse(challengeId: string, student: { id: string; studentNumber: string }, payload: ResponsePayload): Promise<void> {
    const { challenge } = await this.load(challengeId);
    const eligible = await this.eligibleRecords(challenge.state);
    const already = await this.responses.findByChallengeAndStudent(challengeId, student.studentNumber);
    const now = this.clock.now();
    challenge.accept(
      { studentNumber: student.studentNumber, payload },
      { eligible: new Set(eligible.map((r) => r.studentNumber)), alreadyAnswered: !!already, now },
    );
    await this.responses.create({
      challengeId,
      studentId: student.id,
      studentNumber: student.studentNumber,
      tap: payload.tap,
      respondedAt: now,
      verdict: 'pending',
    });
  }

  rollcallToken(data: ChallengeData): { token: string; refreshInMs: number } {
    const challenge = ChallengeFactory.create({ ...data }, { tokens: this.tokens });
    if (!(challenge instanceof RollCallChallenge)) throw new ChallengeError('NOT_ROLLCALL', 'Not a roll-call challenge');
    if (data.status !== 'active' || challenge.isExpired(this.clock.now())) {
      throw new ChallengeError('CHALLENGE_STATE', 'Challenge is not active');
    }
    return { token: challenge.currentToken(), refreshInMs: this.tokens.msUntilNextWindow() };
  }

  async get(challengeId: string): Promise<ChallengeData> {
    const data = await this.challenges.get(challengeId);
    if (!data) throw new NotFoundError('Challenge');
    return data;
  }

  /** Called by a timer; returns how many challenges were closed. */
  async closeExpired(): Promise<number> {
    const due = await this.challenges.listActiveExpired(this.clock.now());
    for (const data of due) await this.close(data.id, false);
    return due.length;
  }

  async close(challengeId: string, force: boolean): Promise<Map<string, Verdict>> {
    const { challenge } = await this.load(challengeId);
    const eligible = await this.eligibleRecords(challenge.state);
    const stored = await this.responses.listByChallenge(challengeId);
    const submitted: SubmittedResponse[] = stored.map((r) => ({ studentNumber: r.studentNumber, payload: { tap: r.tap } }));

    const verdicts = challenge.close(submitted, eligible.map((r) => r.studentNumber), this.clock.now(), force);
    await this.challenges.update(challengeId, { status: 'closed' });

    const byStudent = new Map(stored.map((r) => [r.studentNumber, r]));
    const recordOf = new Map(eligible.map((r) => [r.studentNumber, r]));
    for (const [studentNumber, verdict] of verdicts) {
      const response = byStudent.get(studentNumber);
      if (response) await this.responses.setVerdict(response.id, verdict);
      else {
        await this.responses.create({ challengeId, studentId: recordOf.get(studentNumber)?.studentId, studentNumber, respondedAt: this.clock.now(), verdict });
      }
      const record = recordOf.get(studentNumber);
      if (record && verdict !== 'ok') await this.attendance.flag(record.id, FLAG_REASON[verdict] ?? verdict);
    }
    return verdicts;
  }

  private async load(challengeId: string): Promise<{ challenge: Challenge }> {
    const data = await this.challenges.get(challengeId);
    if (!data) throw new NotFoundError('Challenge');
    const headcount = data.type === 'visual_ping' && data.headcountId ? await this.headcounts.get(data.headcountId) : null;
    return { challenge: ChallengeFactory.create(data, { tokens: this.tokens, headcount }) };
  }

  /** Students checked in (not removed) when the challenge started; late arrivals are not challenged. */
  private async eligibleRecords(data: ChallengeData): Promise<AttendanceRecord[]> {
    const records = await this.attendance.listForSession(data.sessionId);
    return records.filter((r) => r.status !== 'removed' && r.checkedInAt.getTime() <= data.startedAt.getTime());
  }
}
