import type {
  AssignmentRepository,
  FileInput,
  InsightsRepository,
  MaterialRepository,
  PracticeQuestionRepository,
  RecordingRepository,
  SubmissionRepository,
} from '../../content/repositories.js';
import type { Assignment, AssignmentInsights, GuideOutline, GuideStatus, Material, PracticeQuestion, Recording, ReviewGuide, Submission } from '../../content/types.js';
import { InMemoryRepository } from '../InMemoryRepository.js';

export class InMemoryRecordingRepository extends InMemoryRepository<Recording> implements RecordingRepository {
  async listByStatus(statuses: Recording['status'][]) {
    return this.all().filter((r) => statuses.includes(r.status));
  }
}

export class InMemoryAssignmentRepository extends InMemoryRepository<Assignment> implements AssignmentRepository {
  readonly files = new Map<string, FileInput>();
  readonly guides = new Map<string, ReviewGuide>();
  /** Lets a test delete the related rows the way PocketBase cascades. */
  onDelete?: (id: string) => void;

  async createWithFile(data: Omit<Assignment, 'id'>, file: FileInput) {
    const created = await this.create(data);
    this.files.set(created.id, file);
    return created;
  }

  async getFile(id: string) {
    const f = this.files.get(id);
    if (!f) throw new Error('no file');
    return f.data;
  }

  async saveGuide(id: string, guide: ReviewGuide, outline: GuideOutline) {
    this.guides.set(id, guide);
    return this.update(id, { outline, guideStatus: 'ready', guideError: '' });
  }

  async getGuide(id: string) {
    return this.guides.get(id) ?? null;
  }

  async listByGuideStatus(status: GuideStatus) {
    return this.all().filter((a) => a.guideStatus === status);
  }

  async delete(id: string) {
    this.items.delete(id);
    this.files.delete(id);
    this.guides.delete(id);
    this.onDelete?.(id);
  }
}

export class InMemorySubmissionRepository extends InMemoryRepository<Submission> implements SubmissionRepository {
  readonly sketches = new Map<string, number[]>();
  readonly handedIn = new Map<string, FileInput[]>();

  async create(data: Omit<Submission, 'id'>) {
    // Mirrors the unique index (assignment, student_number); synchronous so it is atomic.
    if (this.all().some((s) => s.assignmentId === data.assignmentId && s.studentNumber === data.studentNumber)) throw new Error('UNIQUE constraint');
    return super.create(data);
  }

  async findByAssignmentAndStudent(assignmentId: string, studentNumber: string) {
    return this.all().find((s) => s.assignmentId === assignmentId && s.studentNumber === studentNumber) ?? null;
  }

  async listByAssignment(assignmentId: string) {
    return this.all().filter((s) => s.assignmentId === assignmentId);
  }

  async saveFingerprint(id: string, fingerprint: number[]) {
    this.sketches.set(id, fingerprint);
  }

  async getFingerprints(assignmentId: string) {
    const ids = new Set((await this.listByAssignment(assignmentId)).map((s) => s.id));
    return new Map([...this.sketches].filter(([id]) => ids.has(id)));
  }

  async listByStatus(status: Submission['status']) {
    return this.all().filter((s) => s.status === status);
  }

  async listByFinalStatus(status: Submission['status']) {
    return this.all().filter((s) => s.finalStatus === status);
  }

  async handIn(id: string, data: Partial<Omit<Submission, 'id'>>, files: FileInput[]) {
    this.handedIn.set(id, files);
    return this.update(id, { ...data, files: files.map((f) => f.filename) });
  }

  async getFiles(id: string) {
    return this.handedIn.get(id) ?? [];
  }

  /** Cascade of an assignment delete. */
  removeByAssignment(assignmentId: string) {
    for (const s of this.all().filter((x) => x.assignmentId === assignmentId)) {
      this.items.delete(s.id);
      this.sketches.delete(s.id);
      this.handedIn.delete(s.id);
    }
  }
}

export class InMemoryInsightsRepository extends InMemoryRepository<AssignmentInsights> implements InsightsRepository {
  async upsert(data: Omit<AssignmentInsights, 'id'>) {
    const existing = await this.findByAssignment(data.assignmentId);
    return existing ? this.update(existing.id, data) : this.create(data);
  }

  async findByAssignment(assignmentId: string) {
    return this.all().find((i) => i.assignmentId === assignmentId) ?? null;
  }
}

export class InMemoryPracticeQuestionRepository extends InMemoryRepository<PracticeQuestion> implements PracticeQuestionRepository {
  async delete(id: string) {
    this.items.delete(id);
  }
}

export class InMemoryMaterialRepository extends InMemoryRepository<Material> implements MaterialRepository {
  readonly files = new Map<string, FileInput>();

  async createWithFile(data: Omit<Material, 'id'>, file: FileInput) {
    const created = await this.create(data);
    this.files.set(created.id, file);
    return created;
  }

  async delete(id: string) {
    this.items.delete(id);
    this.files.delete(id);
  }
}
