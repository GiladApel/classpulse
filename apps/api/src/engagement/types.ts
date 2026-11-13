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

/** A question in a lesson's forum, or in the course forum when it has no lesson. */
export interface FeedPost {
  id: string;
  courseId: string;
  sessionId?: string;
  authorId?: string;
  authorNumber: string;
  /** null when anonymous. */
  displayName: string | null;
  anonymous: boolean;
  text: string;
  votes: number;
  answered: boolean;
  /** The lecturer's written answer, shown under the post; empty when none. */
  answer: string;
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
export type PollSource = 'manual' | 'ai';

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

/** End-of-lecture feedback options, each pointing to a different fix: pace (fast/slow) or the explanation itself. */
export const FEEDBACK_RATINGS = ['clear', 'too_fast', 'too_slow', 'unclear'] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

export interface LessonFeedback {
  id: string;
  sessionId: string;
  studentId?: string;
  studentNumber: string;
  rating: FeedbackRating;
  comment: string;
  submittedAt: Date;
}

export interface FeedbackStatus {
  open: boolean;
  submitted: boolean;
  closesAt: Date | null;
}

/** What the lecturer sees: nothing but the count until there are enough responses to stay anonymous. */
export interface FeedbackSummary {
  responses: number;
  visible: boolean;
  counts: Record<FeedbackRating, number> | null;
  comments: { rating: FeedbackRating; text: string }[];
}
