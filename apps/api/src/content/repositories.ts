import type { Repository } from '../infra/Repository.js';
import type { Assignment, AssignmentInsights, Recording, Submission } from './types.js';

export interface RecordingRepository extends Repository<Recording> {
  listByStatus(statuses: Recording['status'][]): Promise<Recording[]>;
}

export type AssignmentRepository = Repository<Assignment>;

export interface SubmissionRepository extends Repository<Submission> {
  /** Stores the uploaded file alongside the record. */
  createWithFile(data: Omit<Submission, 'id'>, file: { data: Buffer; filename: string; mimeType: string }): Promise<Submission>;
  replaceFile(id: string, data: Partial<Omit<Submission, 'id'>>, file: { data: Buffer; filename: string; mimeType: string }): Promise<Submission>;
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
