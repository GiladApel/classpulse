export type RecordingKind = 'media' | 'transcript';
export type RecordingStatus = 'uploading' | 'queued' | 'processing' | 'done' | 'failed';

export interface Chapter {
  startSec: number;
  title: string;
  summary: string;
}

export interface LectureSummary {
  tldr: string;
  chapters: Chapter[];
  concepts: { term: string; explanation: string }[];
  questions: { question: string; answer: string }[];
}

export interface Recording {
  id: string;
  sessionId: string;
  kind: RecordingKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Seconds from the session start to the start of the recording (negative if recording began first). */
  offsetSec: number;
  status: RecordingStatus;
  error: string;
  summary: LectureSummary | null;
  published: boolean;
  createdAt: Date;
  processedAt?: Date;
}

export interface TimelineBucket {
  /** Seconds into the recording. */
  t: number;
  count: number;
}

export interface Spike extends TimelineBucket {
  chapter: string | null;
}

export interface Timeline {
  bucketSec: number;
  buckets: TimelineBucket[];
  spikes: Spike[];
}

/** One section of a homework's review guide. `expected` holds the answer, so the guide never leaves the API. */
export interface GuideSection {
  id: string;
  asked: string;
  requirements: string[];
  expected: string;
  /** What, in this subject, would count as giving the answer away. */
  givingAway: string;
}

export interface GuideQuestion {
  id: string;
  title: string;
  sections: GuideSection[];
}

/** Made once per homework from its PDF and used unchanged for every check. */
export interface ReviewGuide {
  questions: GuideQuestion[];
  instructions: string;
}

/** The guide without answers: what students and the lecturer see. */
export interface GuideOutline {
  questions: { id: string; title: string; sections: { id: string; asked: string; requirements: string[] }[] }[];
}

/** The reviewer's mark of one section. */
export interface SectionMark {
  id: string;
  answered: boolean;
  /** 0 if not answered, else 1–100. */
  score: number;
  meets: string;
  missing: string;
  direction: string;
}

export interface QuestionScore {
  id: string;
  score: number;
}

export type GuideStatus = 'generating' | 'ready' | 'failed';

/** A homework published as a PDF; the AI's review guide is stored apart (hidden), the outline is public. */
export interface Assignment {
  id: string;
  courseId: string;
  /** The lesson it was published in, if any. */
  sessionId?: string;
  title: string;
  dueAt?: Date;
  createdAt: Date;
  guideStatus: GuideStatus;
  guideError: string;
  outline: GuideOutline | null;
}

export interface HomeworkReport {
  marks: SectionMark[];
  questions: QuestionScore[];
  /** Short labels of the mistakes made, used for the class-wide common mistakes. */
  mistakes: string[];
}

export type SubmissionStatus = 'processing' | 'done' | 'failed';

/** One per student per homework: the latest successful check. The solution file is never kept. */
export interface Submission {
  id: string;
  assignmentId: string;
  studentId?: string;
  studentNumber: string;
  studentName: string;
  status: SubmissionStatus;
  error: string;
  /** Successful checks so far (a failed check does not count). */
  checkCount: number;
  report: HomeworkReport | null;
  /** 1–100, null until the first successful check. */
  total: number | null;
  late: boolean;
  submittedAt: Date;
  reviewedAt?: Date;
}

export interface CommonMistake {
  title: string;
  description: string;
  count: number;
}

export interface SimilarPair {
  a: string;
  b: string;
  similarity: number;
}

export interface AssignmentInsights {
  id: string;
  assignmentId: string;
  submissionCount: number;
  commonMistakes: CommonMistake[];
  /** Submission ids; lecturer-only. */
  similarPairs: SimilarPair[];
  builtAt: Date;
}

/** An open review question the lecturer publishes on a lecture page; students read it, there is nothing to submit. */
export interface PracticeQuestion {
  id: string;
  sessionId: string;
  question: string;
  source: 'manual' | 'ai';
  createdAt: Date;
}

export type MaterialKind = 'file' | 'link';

export interface Material {
  id: string;
  sessionId: string;
  title: string;
  kind: MaterialKind;
  /** Link target; empty for files. */
  url: string;
  /** Original file name; empty for links. */
  filename: string;
  addedAt: Date;
}
