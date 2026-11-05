import type { RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { AssignmentRepository, InsightsRepository, RecordingRepository, SubmissionRepository } from '../../content/repositories.js';
import type { Assignment, AssignmentInsights, LectureSummary, Recording, Review, RubricCriterion, Submission } from '../../content/types.js';
import { compact, PbRepository, toDate } from './PbRepository.js';

type FileInput = { data: Buffer; filename: string; mimeType: string };
const toFile = (f: FileInput) => new File([new Uint8Array(f.data)], f.filename, { type: f.mimeType || 'application/octet-stream' });

export class PbRecordingRepository extends PbRepository<Recording> implements RecordingRepository {
  constructor(pb: PocketBase) {
    super(pb, 'recordings');
  }

  async listByStatus(statuses: Recording['status'][]) {
    const filter = statuses.map((_, i) => `status = {:s${i}}`).join(' || ');
    const params = Object.fromEntries(statuses.map((s, i) => [`s${i}`, s]));
    return (await this.col.getFullList({ filter: this.pb.filter(filter, params) })).map((r) => this.toEntity(r));
  }

  protected toEntity(r: RecordModel): Recording {
    return {
      id: r.id,
      sessionId: r.session,
      kind: r.kind,
      filename: r.filename,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      offsetSec: r.offset_sec,
      status: r.status,
      error: r.error,
      summary: (r.summary as LectureSummary | null) || null,
      published: r.published,
      createdAt: toDate(r.created_at)!,
      processedAt: toDate(r.processed_at),
    };
  }

  protected toRecord(d: Partial<Omit<Recording, 'id'>>) {
    return compact({
      session: d.sessionId,
      kind: d.kind,
      filename: d.filename,
      mime_type: d.mimeType,
      size_bytes: d.sizeBytes,
      offset_sec: d.offsetSec,
      status: d.status,
      error: d.error,
      summary: d.summary,
      published: d.published,
      created_at: d.createdAt?.toISOString(),
      processed_at: d.processedAt?.toISOString(),
    });
  }
}

export class PbAssignmentRepository extends PbRepository<Assignment> implements AssignmentRepository {
  constructor(pb: PocketBase) {
    super(pb, 'assignments');
  }

  protected toEntity(r: RecordModel): Assignment {
    return {
      id: r.id,
      courseId: r.course,
      title: r.title,
      description: r.description,
      rubric: r.rubric as RubricCriterion[],
      dueAt: toDate(r.due_at),
      createdAt: toDate(r.created_at)!,
    };
  }

  protected toRecord(d: Partial<Omit<Assignment, 'id'>>) {
    return compact({
      course: d.courseId,
      title: d.title,
      description: d.description,
      rubric: d.rubric,
      due_at: d.dueAt?.toISOString(),
      created_at: d.createdAt?.toISOString(),
    });
  }
}

export class PbSubmissionRepository extends PbRepository<Submission> implements SubmissionRepository {
  constructor(pb: PocketBase) {
    super(pb, 'submissions');
  }

  async createWithFile(data: Omit<Submission, 'id'>, file: FileInput) {
    return this.toEntity(await this.col.create({ ...this.toRecord(data), file: toFile(file) }));
  }

  async replaceFile(id: string, data: Partial<Omit<Submission, 'id'>>, file: FileInput) {
    return this.toEntity(await this.col.update(id, { ...this.toRecord(data), file: toFile(file) }));
  }

  findByAssignmentAndStudent(assignmentId: string, studentNumber: string) {
    return this.first('assignment = {:a} && student_number = {:n}', { a: assignmentId, n: studentNumber });
  }

  async listByAssignment(assignmentId: string) {
    return (await this.col.getFullList({ filter: this.pb.filter('assignment = {:a}', { a: assignmentId }), sort: 'submitted_at' })).map((r) => this.toEntity(r));
  }

  async saveAnalysis(id: string, textExtract: string, fingerprint: number[]) {
    await this.col.update(id, { text_extract: textExtract, fingerprint });
  }

  async getFingerprints(assignmentId: string) {
    const list = await this.col.getFullList({ filter: this.pb.filter('assignment = {:a}', { a: assignmentId }), fields: 'id,fingerprint' });
    return new Map(list.filter((r) => Array.isArray(r.fingerprint) && r.fingerprint.length).map((r) => [r.id, r.fingerprint as number[]]));
  }

  async listByStatus(status: Submission['status']) {
    return (await this.col.getFullList({ filter: this.pb.filter('status = {:s}', { s: status }) })).map((r) => this.toEntity(r));
  }

  protected toEntity(r: RecordModel): Submission {
    return {
      id: r.id,
      assignmentId: r.assignment,
      studentId: r.student || undefined,
      studentNumber: r.student_number,
      studentName: r.student_name,
      filename: r.filename,
      status: r.status,
      error: r.error,
      review: (r.review as Review | null) || null,
      // PB number fields can't be null; -1 means "not reviewed yet".
      total: r.total >= 0 ? r.total : null,
      late: r.late,
      submittedAt: toDate(r.submitted_at)!,
      reviewedAt: toDate(r.reviewed_at),
    };
  }

  protected toRecord(d: Partial<Omit<Submission, 'id'>>) {
    return compact({
      assignment: d.assignmentId,
      student: d.studentId,
      student_number: d.studentNumber,
      student_name: d.studentName,
      filename: d.filename,
      status: d.status,
      error: d.error,
      review: d.review,
      total: 'total' in d ? (d.total ?? -1) : undefined,
      late: d.late,
      submitted_at: d.submittedAt?.toISOString(),
      reviewed_at: d.reviewedAt?.toISOString(),
    });
  }
}

export class PbInsightsRepository extends PbRepository<AssignmentInsights> implements InsightsRepository {
  constructor(pb: PocketBase) {
    super(pb, 'assignment_insights');
  }

  async upsert(data: Omit<AssignmentInsights, 'id'>) {
    const existing = await this.findByAssignment(data.assignmentId);
    return existing ? this.update(existing.id, data) : this.create(data);
  }

  findByAssignment(assignmentId: string) {
    return this.first('assignment = {:a}', { a: assignmentId });
  }

  protected toEntity(r: RecordModel): AssignmentInsights {
    return {
      id: r.id,
      assignmentId: r.assignment,
      submissionCount: r.submission_count,
      distribution: r.distribution,
      commonMistakes: r.common_mistakes ?? [],
      similarPairs: r.similar_pairs ?? [],
      builtAt: toDate(r.built_at)!,
    };
  }

  protected toRecord(d: Partial<Omit<AssignmentInsights, 'id'>>) {
    return compact({
      assignment: d.assignmentId,
      submission_count: d.submissionCount,
      distribution: d.distribution,
      common_mistakes: d.commonMistakes,
      similar_pairs: d.similarPairs,
      built_at: d.builtAt?.toISOString(),
    });
  }
}
