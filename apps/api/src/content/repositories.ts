import type { Repository } from '../infra/Repository.js';
import type { Assignment, AssignmentInsights, GuideOutline, GuideStatus, Material, PracticeQuestion, Recording, ReviewGuide, Submission } from './types.js';

export type FileInput = { data: Buffer; filename: string; mimeType: string };

export interface RecordingRepository extends Repository<Recording> {
  listByStatus(statuses: Recording['status'][]): Promise<Recording[]>;
}

export interface AssignmentRepository extends Repository<Assignment> {
  /** Stores the homework PDF alongside the record. */
  createWithFile(data: Omit<Assignment, 'id'>, file: FileInput): Promise<Assignment>;
  getFile(id: string): Promise<Buffer>;
  /** The guide is a hidden field; saving it marks the homework ready. */
  saveGuide(id: string, guide: ReviewGuide, outline: GuideOutline): Promise<Assignment>;
  getGuide(id: string): Promise<ReviewGuide | null>;
  listByGuideStatus(status: GuideStatus): Promise<Assignment[]>;
  delete(id: string): Promise<void>;
}

export interface SubmissionRepository extends Repository<Submission> {
  findByAssignmentAndStudent(assignmentId: string, studentNumber: string): Promise<Submission | null>;
  listByAssignment(assignmentId: string): Promise<Submission[]>;
  /** API-only (hidden field). */
  saveFingerprint(id: string, fingerprint: number[]): Promise<void>;
  getFingerprints(assignmentId: string): Promise<Map<string, number[]>>;
  listByStatus(status: Submission['status']): Promise<Submission[]>;
  listByFinalStatus(status: Submission['status']): Promise<Submission[]>;
  /** Stores the handed-in files with the hand-in fields. */
  handIn(id: string, data: Partial<Omit<Submission, 'id'>>, files: FileInput[]): Promise<Submission>;
  getFiles(id: string): Promise<FileInput[]>;
}

export interface InsightsRepository {
  upsert(data: Omit<AssignmentInsights, 'id'>): Promise<AssignmentInsights>;
  findByAssignment(assignmentId: string): Promise<AssignmentInsights | null>;
}

export interface PracticeQuestionRepository extends Repository<PracticeQuestion> {
  delete(id: string): Promise<void>;
}

export interface MaterialRepository extends Repository<Material> {
  /** Stores the uploaded file alongside the record. */
  createWithFile(data: Omit<Material, 'id'>, file: FileInput): Promise<Material>;
  delete(id: string): Promise<void>;
}
