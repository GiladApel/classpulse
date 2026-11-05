import type { ChallengeData, ChallengeResponse, Headcount, Verdict } from './types.js';

export interface HeadcountRepository {
  create(data: Omit<Headcount, 'id'>, files: { photo: Buffer; blurred: Buffer }): Promise<Headcount>;
  get(id: string): Promise<Headcount | null>;
  getBlurred(id: string): Promise<Buffer>;
  /** Privacy: the clear photo exists only while the session is running. */
  purgeClearPhotos(sessionId: string): Promise<void>;
}

export interface ChallengeRepository {
  create(data: Omit<ChallengeData, 'id'>, image?: Buffer): Promise<ChallengeData>;
  get(id: string): Promise<ChallengeData | null>;
  update(id: string, data: Partial<Omit<ChallengeData, 'id'>>): Promise<ChallengeData>;
  findActiveBySession(sessionId: string): Promise<ChallengeData | null>;
  listActiveExpired(now: Date): Promise<ChallengeData[]>;
}

export interface ChallengeResponseRepository {
  create(data: Omit<ChallengeResponse, 'id'>): Promise<ChallengeResponse>;
  findByChallengeAndStudent(challengeId: string, studentNumber: string): Promise<ChallengeResponse | null>;
  listByChallenge(challengeId: string): Promise<ChallengeResponse[]>;
  setVerdict(id: string, verdict: Verdict): Promise<void>;
}
