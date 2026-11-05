import { Challenge, ChallengeError, type SubmittedResponse } from './Challenge.js';
import type { SeatHitTester } from './SeatHitTester.js';
import type { Box, ChallengeData, Point, ResponsePayload, Verdict } from './types.js';

/** Students tap their seat on a blurred class photo; taps are hit-tested against the detected person boxes. */
export class VisualPingChallenge extends Challenge {
  constructor(
    data: ChallengeData,
    private readonly boxes: Box[],
    private readonly hitTester: SeatHitTester,
  ) {
    super(data);
  }

  protected validatePayload(payload: ResponsePayload): void {
    const t = payload.tap;
    const ok = t && [t.x, t.y].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1);
    if (!ok) throw new ChallengeError('TAP_INVALID', 'יש להקיש על מקומך בתמונה');
  }

  protected evaluate(responses: SubmittedResponse[]): Map<string, Verdict> {
    const taps = new Map<string, Point>();
    for (const r of responses) if (r.payload.tap) taps.set(r.studentNumber, r.payload.tap);
    return this.hitTester.classify(taps, this.boxes);
  }
}
