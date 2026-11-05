export interface Participant {
  id: string;
  studentNumber: string;
  name: string;
}

export interface LostSignal {
  id: string;
  sessionId: string;
  studentId?: string;
  studentNumber: string;
  at: Date;
}

export interface ConfusionLevel {
  /** Distinct students who signalled within the window. */
  lost: number;
  present: number;
  /** lost / present, 0 when nobody is present. */
  ratio: number;
  windowSec: number;
}

export interface TimePoint {
  t: Date;
  count: number;
}

export interface FeedPost {
  id: string;
  sessionId: string;
  authorId?: string;
  authorNumber: string;
  /** null when anonymous. */
  displayName: string | null;
  anonymous: boolean;
  text: string;
  votes: number;
  answered: boolean;
  postedAt: Date;
}

export interface PostVote {
  id: string;
  postId: string;
  voterId?: string;
  voterNumber: string;
}

export interface Theme {
  title: string;
  summary: string;
  postIds: string[];
}

export type PollStatus = 'draft' | 'open' | 'closed';
export type PollSource = 'template' | 'manual' | 'ai';
export type TemplateKind = 'yes_no' | 'abcd' | 'scale5';

export interface McqDraft {
  question: string;
  options: string[];
  correctIndex: number | null;
}

export interface Poll {
  id: string;
  sessionId: string;
  question: string;
  options: string[];
  correctIndex: number | null;
  status: PollStatus;
  source: PollSource;
  results: PollResults | null;
  createdAt: Date;
  openedAt?: Date;
  closedAt?: Date;
}

export interface PollVote {
  id: string;
  pollId: string;
  studentId?: string;
  studentNumber: string;
  optionIndex: number;
}

export interface PollResults {
  counts: number[];
  total: number;
  correctIndex: number | null;
}
