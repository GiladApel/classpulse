import type { RecordModel } from 'pocketbase';
import { api, ApiError } from './api';

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

export interface RubricCriterion {
  id: string;
  criterion: string;
  weight: number;
  description: string;
}

export type AssignmentRecord = RecordModel & {
  course: string;
  title: string;
  description: string;
  rubric: RubricCriterion[];
  due_at: string;
  created_at: string;
};

export interface Review {
  summary: string;
  criteria: { id: string; score: number; strengths: string[]; fixes: string[] }[];
  mistakes: string[];
}

export interface SubmissionDto {
  id: string;
  assignmentId: string;
  studentNumber: string;
  studentName: string;
  filename: string;
  status: 'processing' | 'done' | 'failed';
  error: string;
  review: Review | null;
  total: number | null;
  late: boolean;
  submittedAt: string;
}

export interface SubmissionView {
  submission: SubmissionDto;
  percentiles: { total: number; criteria: Record<string, number> } | null;
  classSize: number;
  commonMistakes: { title: string; description: string; count: number }[];
}

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
