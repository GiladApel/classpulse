import type { RecordModel } from 'pocketbase';
import { api, ApiError } from './api';
import { pb } from './pb';

export interface LectureSummary {
  tldr: string;
  chapters: { startSec: number; title: string; summary: string }[];
  concepts: { term: string; explanation: string }[];
  questions: { question: string; answer: string }[];
}

export type RecordingRecord = RecordModel & {
  session: string;
  kind: 'media' | 'transcript';
  filename: string;
  size_bytes: number;
  offset_sec: number;
  status: 'uploading' | 'queued' | 'processing' | 'done' | 'failed';
  error: string;
  summary: LectureSummary | null;
  published: boolean;
  created_at: string;
};

export interface Timeline {
  bucketSec: number;
  buckets: { t: number; count: number }[];
  spikes: { t: number; count: number; chapter: string | null }[];
}

/** For a student the requirements come empty: the rubric is the lecturer's. */
export interface GuideOutline {
  questions: { id: string; title: string; sections: { id: string; asked: string; requirements: string[] }[] }[];
}

/** The whole rubric, lecturer only (API). */
export interface Rubric {
  guide: {
    instructions: string;
    questions: { id: string; title: string; sections: { id: string; asked: string; requirements: string[]; expected: string; givingAway: string }[] }[];
  } | null;
  notes: string;
  locked: boolean;
}

/** The rubric, its outline and the lecturer's notes are hidden fields: PocketBase never returns them. */
export type AssignmentRecord = RecordModel & {
  course: string;
  session: string;
  title: string;
  due_at: string;
  created_at: string;
  file: string;
  guide_status: 'generating' | 'ready' | 'failed';
  guide_error: string;
};

export type SubmissionRecord = RecordModel & {
  student: string;
  student_name: string;
  student_number: string;
  status: 'processing' | 'done' | 'failed';
  error: string;
  check_count: number;
  total: number;
  late: boolean;
  submitted_at: string;
  handed_in_at: string;
  files: string[];
  final_status: '' | 'processing' | 'done' | 'failed';
};

export interface SectionMark {
  id: string;
  answered: boolean;
  score: number;
  meets: string;
  missing: string;
  direction: string;
}

export interface HomeworkReport {
  marks: SectionMark[];
  questions: { id: string; score: number }[];
  mistakes: string[];
}

export interface SubmissionDto {
  id: string;
  assignmentId: string;
  studentNumber: string;
  studentName: string;
  status: 'processing' | 'done' | 'failed';
  error: string;
  checkCount: number;
  report: HomeworkReport | null;
  total: number | null;
  late: boolean;
  submittedAt: string;
  reviewedAt: string | null;
  handedInAt: string | null;
  files: string[];
  /** Lecturer only: the AI's grade of the hand-in. */
  finalStatus?: 'processing' | 'done' | 'failed' | null;
  finalError?: string;
  finalReport?: HomeworkReport | null;
  finalTotal?: number | null;
}

export interface SubmissionView {
  submission: SubmissionDto;
  outline: GuideOutline | null;
  checksLeft: number;
  commonMistakes: { title: string; description: string; count: number }[];
}

export const MAX_CHECKS = 2;

/** Protected files open with a file token; the tab opens first because mobile Safari blocks window.open after an await. */
export async function openProtectedFile(record: { id: string; collectionName: string }, filename: string) {
  const tab = window.open('about:blank', '_blank');
  const url = pb.files.getURL(record, filename, { token: await pb.files.getToken() });
  if (tab) tab.location.href = url;
  else location.href = url;
}

export const openHomeworkPdf = (a: AssignmentRecord) => openProtectedFile(a, a.file);
export const openHandInFile = (submissionId: string, filename: string) => openProtectedFile({ id: submissionId, collectionName: 'submissions' }, filename);

export const formatSec = (s: number) => {
  const sign = s < 0 ? '-' : '';
  const a = Math.abs(Math.round(s));
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const sec = String(a % 60).padStart(2, '0');
  return h ? `${sign}${h}:${String(m).padStart(2, '0')}:${sec}` : `${sign}${m}:${sec}`;
};

export const STATUS_HE: Record<RecordingRecord['status'], string> = {
  uploading: 'מעלה…',
  queued: 'בתור לעיבוד',
  processing: 'ה-AI צופה בהרצאה…',
  done: 'מוכן',
  failed: 'נכשל',
};

/**
 * Upload in chunks the API names (≤50 MB: under Cloudflare's 100 MB request cap). A chunk that fails on the
 * network or with a 5xx is retried; the server ignores a chunk it already has, so retries are safe.
 */
export async function uploadRecording(sessionId: string, file: File, offsetSec: number, onProgress: (fraction: number) => void): Promise<string> {
  const rec = await api.post<{ id: string; chunkBytes: number }>(`/sessions/${sessionId}/recordings`, {
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    offsetSec,
  });
  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + rec.chunkBytes);
    try {
      const res = await api.put<{ received: number }>(`/recordings/${rec.id}/data?offset=${offset}`, chunk);
      offset = res.received;
      failures = 0;
      onProgress(offset / file.size);
    } catch (e) {
      if (++failures > 3 || (e instanceof ApiError && e.status < 500)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * failures));
    }
  }
  await api.post(`/recordings/${rec.id}/complete`);
  return rec.id;
}

export type PracticeRecord = RecordModel & {
  session: string;
  question: string;
  source: 'manual' | 'ai';
  created_at: string;
};

export type MaterialRecord = RecordModel & {
  session: string;
  title: string;
  kind: 'file' | 'link';
  url: string;
  file: string;
  filename: string;
  added_at: string;
};
