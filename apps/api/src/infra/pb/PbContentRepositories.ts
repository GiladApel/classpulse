import type { RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type {
  AssignmentRepository,
  FileInput,
  InsightsRepository,
  MaterialRepository,
  PracticeQuestionRepository,
  RecordingRepository,
  SubmissionRepository,
} from '../../content/repositories.js';
import type {
  Assignment,
  AssignmentInsights,
  LectureSummary,
  Material,
  PracticeQuestion,
  GuideOutline,
  GuideStatus,
  HomeworkReport,
  Recording,
  ReviewGuide,
  Submission,
} from '../../content/types.js';
import { compact, PbRepository, toDate } from './PbRepository.js';

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

  async createWithFile(data: Omit<Assignment, 'id'>, file: FileInput) {
    return this.toEntity(await this.col.create({ ...this.toRecord(data), file: toFile(file) }));
  }

  /** The file is protected, so the API (superuser) downloads it with a file token. */
  async getFile(id: string) {
    const r = await this.col.getOne(id);
    const res = await fetch(this.pb.files.getURL(r, r.file, { token: await this.pb.files.getToken() }));
    if (!res.ok) throw new Error(`homework file ${id}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async saveGuide(id: string, guide: ReviewGuide, outline: GuideOutline) {
    return this.toEntity(await this.col.update(id, { guide, outline, guide_status: 'ready', guide_error: '' }));
  }

  async getGuide(id: string) {
    const r = await this.col.getOne(id, { fields: 'guide' });
    return (r.guide as ReviewGuide | null) || null;
  }

  async listByGuideStatus(status: GuideStatus) {
    return (await this.col.getFullList({ filter: this.pb.filter('guide_status = {:s}', { s: status }) })).map((r) => this.toEntity(r));
  }

  async delete(id: string) {
    await this.col.delete(id);
  }

  protected toEntity(r: RecordModel): Assignment {
    return {
      id: r.id,
      courseId: r.course,
      sessionId: r.session || undefined,
      title: r.title,
      dueAt: toDate(r.due_at),
      createdAt: toDate(r.created_at)!,
      guideStatus: r.guide_status,
      guideError: r.guide_error ?? '',
      outline: (r.outline as GuideOutline | null) || null,
    };
  }

  protected toRecord(d: Partial<Omit<Assignment, 'id'>>) {
    return compact({
      course: d.courseId,
      session: d.sessionId,
      title: d.title,
      due_at: d.dueAt?.toISOString(),
      created_at: d.createdAt?.toISOString(),
      guide_status: d.guideStatus,
      guide_error: d.guideError,
      outline: d.outline === null ? undefined : d.outline,
    });
  }
}

export class PbSubmissionRepository extends PbRepository<Submission> implements SubmissionRepository {
  constructor(pb: PocketBase) {
    super(pb, 'submissions');
  }

  findByAssignmentAndStudent(assignmentId: string, studentNumber: string) {
    return this.first('assignment = {:a} && student_number = {:n}', { a: assignmentId, n: studentNumber });
  }

  async listByAssignment(assignmentId: string) {
    return (await this.col.getFullList({ filter: this.pb.filter('assignment = {:a}', { a: assignmentId }), sort: 'submitted_at' })).map((r) => this.toEntity(r));
  }

  async saveFingerprint(id: string, fingerprint: number[]) {
    await this.col.update(id, { fingerprint });
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
      status: r.status,
      error: r.error,
      checkCount: r.check_count ?? 0,
      report: (r.report as HomeworkReport | null) || null,
      // PB number fields can't be null; -1 means "not checked yet".
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
      status: d.status,
      error: d.error,
      check_count: d.checkCount,
      report: d.report === null ? undefined : d.report,
      total: d.total === undefined ? undefined : d.total === null ? -1 : d.total,
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
      commonMistakes: r.common_mistakes ?? [],
      similarPairs: r.similar_pairs ?? [],
      builtAt: toDate(r.built_at)!,
    };
  }

  protected toRecord(d: Partial<Omit<AssignmentInsights, 'id'>>) {
    return compact({
      assignment: d.assignmentId,
      submission_count: d.submissionCount,
      common_mistakes: d.commonMistakes,
      similar_pairs: d.similarPairs,
      built_at: d.builtAt?.toISOString(),
    });
  }
}

export class PbPracticeQuestionRepository extends PbRepository<PracticeQuestion> implements PracticeQuestionRepository {
  constructor(pb: PocketBase) {
    super(pb, 'practice_questions');
  }

  async delete(id: string) {
    await this.col.delete(id);
  }

  protected toEntity(r: RecordModel): PracticeQuestion {
    return {
      id: r.id,
      sessionId: r.session,
      question: r.question,
      source: r.source,
      createdAt: toDate(r.created_at)!,
    };
  }

  protected toRecord(d: Partial<Omit<PracticeQuestion, 'id'>>) {
    return compact({
      session: d.sessionId,
      question: d.question,
      source: d.source,
      created_at: d.createdAt?.toISOString(),
    });
  }
}

export class PbMaterialRepository extends PbRepository<Material> implements MaterialRepository {
  constructor(pb: PocketBase) {
    super(pb, 'materials');
  }

  async createWithFile(data: Omit<Material, 'id'>, file: FileInput) {
    return this.toEntity(await this.col.create({ ...this.toRecord(data), file: toFile(file) }));
  }

  async delete(id: string) {
    await this.col.delete(id);
  }

  protected toEntity(r: RecordModel): Material {
    return {
      id: r.id,
      sessionId: r.session,
      title: r.title,
      kind: r.kind,
      url: r.url,
      filename: r.filename,
      addedAt: toDate(r.added_at)!,
    };
  }

  protected toRecord(d: Partial<Omit<Material, 'id'>>) {
    return compact({
      session: d.sessionId,
      title: d.title,
      kind: d.kind,
      url: d.url,
      filename: d.filename,
      added_at: d.addedAt?.toISOString(),
    });
  }
}
