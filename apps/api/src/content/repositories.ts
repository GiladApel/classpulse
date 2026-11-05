import type { Repository } from '../infra/Repository.js';
import type { Assignment, AssignmentInsights, Material, PracticeAnswer, PracticeQuestion, Recording, Submission } from './types.js';

export type FileInput = { data: Buffer; filename: string; mimeType: string };

export interface RecordingRepository extends Repository<Recording> {
  listByStatus(statuses: Recording['status'][]): Promise<Recording[]>;
}

export type AssignmentRepository = Repository<Assignment>;

export interface SubmissionRepository extends Repository<Submission> {
  /** Stores the uploaded file alongside the record. */
  createWithFile(data: Omit<Submission, 'id'>, file: FileInput): Promise<Submission>;
  replaceFile(id: string, data: Partial<Omit<Submission, 'id'>>, file: FileInput): Promise<Submission>;
  findByAssignmentAndStudent(assignmentId: string, studentNumber: string): Promise<Submission | null>;
  listByAssignment(assignmentId: string): Promise<Submission[]>;
  /** API-only analysis data (hidden fields). */
  saveAnalysis(id: string, textExtract: string, fingerprint: number[]): Promise<void>;
  getFingerprints(assignmentId: string): Promise<Map<string, number[]>>;
  listByStatus(status: Submission['status']): Promise<Submission[]>;
}

export interface InsightsRepository {
  upsert(data: Omit<AssignmentInsights, 'id'>): Promise<AssignmentInsights>;
  findByAssignment(assignmentId: string): Promise<AssignmentInsights | null>;
}

export interface PracticeQuestionRepository extends Repository<PracticeQuestion> {
  listBySession(sessionId: string): Promise<PracticeQuestion[]>;
  delete(id: string): Promise<void>;
}

export interface PracticeAnswerRepository {
  /** Throws on a duplicate (question, studentNumber). */
  create(data: Omit<PracticeAnswer, 'id'>): Promise<PracticeAnswer>;
  find(questionId: string, studentNumber: string): Promise<PracticeAnswer | null>;
}

export interface MaterialRepository extends Repository<Material> {
  /** Stores the uploaded file alongside the record. */
  createWithFile(data: Omit<Material, 'id'>, file: FileInput): Promise<Material>;
  delete(id: string): Promise<void>;
}
