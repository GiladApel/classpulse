import type {
  FileInput,
  InsightsRepository,
  MaterialRepository,
  PracticeQuestionRepository,
  RecordingRepository,
  SubmissionRepository,
} from '../../content/repositories.js';
import type { Assignment, AssignmentInsights, Material, PracticeQuestion, Recording, Submission } from '../../content/types.js';
import { InMemoryRepository } from '../InMemoryRepository.js';

export class InMemoryRecordingRepository extends InMemoryRepository<Recording> implements RecordingRepository {
  async listByStatus(statuses: Recording['status'][]) {
    return this.all().filter((r) => statuses.includes(r.status));
  }
}

export class InMemoryAssignmentRepository extends InMemoryRepository<Assignment> {}

export class InMemorySubmissionRepository extends InMemoryRepository<Submission> implements SubmissionRepository {
  readonly files = new Map<string, { data: Buffer; filename: string; mimeType: string }>();
  readonly texts = new Map<string, string>();
  readonly sketches = new Map<string, number[]>();

  async createWithFile(data: Omit<Submission, 'id'>, file: { data: Buffer; filename: string; mimeType: string }) {
    // Mirrors the unique index (assignment, student_number); synchronous so it is atomic.
    if (this.all().some((s) => s.assignmentId === data.assignmentId && s.studentNumber === data.studentNumber)) throw new Error('UNIQUE constraint');
    const created = await this.create(data);
    this.files.set(created.id, file);
    return created;
  }

  async replaceFile(id: string, data: Partial<Omit<Submission, 'id'>>, file: { data: Buffer; filename: string; mimeType: string }) {
    this.files.set(id, file);
    return this.update(id, data);
  }

  async findByAssignmentAndStudent(assignmentId: string, studentNumber: string) {
    return this.all().find((s) => s.assignmentId === assignmentId && s.studentNumber === studentNumber) ?? null;
  }

  async listByAssignment(assignmentId: string) {
    return this.all().filter((s) => s.assignmentId === assignmentId);
  }

  async saveAnalysis(id: string, text: string, fingerprint: number[]) {
    this.texts.set(id, text);
    this.sketches.set(id, fingerprint);
  }

  async getFingerprints(assignmentId: string) {
    const ids = new Set((await this.listByAssignment(assignmentId)).map((s) => s.id));
    return new Map([...this.sketches].filter(([id]) => ids.has(id)));
  }

  async listByStatus(status: Submission['status']) {
    return this.all().filter((s) => s.status === status);
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
