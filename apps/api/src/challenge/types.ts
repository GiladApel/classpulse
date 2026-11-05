/** Coordinates are normalized to 0..1 of the (EXIF-oriented) photo. */
export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ChallengeType = 'rollcall' | 'visual_ping';
export type ChallengeStatus = 'pending' | 'active' | 'closed';
export type Verdict = 'pending' | 'ok' | 'empty_seat' | 'collision' | 'no_response';

export interface Headcount {
  id: string;
  sessionId: string;
  /** null when detection failed — the lecturer can still run a roll-call. */
  peopleCount: number | null;
  confidence: number;
  boxes: Box[];
  checkinsAtSnap: number;
  createdAt: Date;
}

export interface ChallengeData {
  id: string;
  sessionId: string;
  headcountId?: string;
  type: ChallengeType;
  status: ChallengeStatus;
  startedAt: Date;
  expiresAt: Date;
  secret: string;
}

export interface ChallengeResponse {
  id: string;
  challengeId: string;
  studentId?: string;
  studentNumber: string;
  tap?: Point;
  respondedAt: Date;
  verdict: Verdict;
}

export interface ResponsePayload {
  tap?: Point;
  token?: string;
}
