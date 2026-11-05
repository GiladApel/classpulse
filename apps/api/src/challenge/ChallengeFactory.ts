import type { QrTokenService } from '../attendance/QrTokenService.js';
import type { Challenge } from './Challenge.js';
import { ChallengeError } from './Challenge.js';
import { RollCallChallenge } from './RollCallChallenge.js';
import { SeatHitTester } from './SeatHitTester.js';
import type { ChallengeData, Headcount } from './types.js';
import { VisualPingChallenge } from './VisualPingChallenge.js';

export class ChallengeFactory {
  static create(data: ChallengeData, deps: { tokens: QrTokenService; headcount?: Headcount | null }): Challenge {
    if (data.type === 'rollcall') return new RollCallChallenge(data, deps.tokens);
    if (!deps.headcount || deps.headcount.peopleCount === null) {
      throw new ChallengeError('HEADCOUNT_REQUIRED', 'Visual Ping דורש צילום כיתה עם זיהוי אנשים');
    }
    return new VisualPingChallenge(data, deps.headcount.boxes, new SeatHitTester());
  }
}
