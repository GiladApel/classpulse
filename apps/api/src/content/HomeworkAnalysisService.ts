import type { HomeworkReviewer } from '../ai/HomeworkReviewer.js';
import { LLMOutputError } from '../ai/LLMProvider.js';
import type { CourseService } from '../attendance/CourseService.js';
import type { Course } from '../attendance/types.js';
import type { Participant } from '../engagement/types.js';
import type { BackgroundQueue } from '../infra/BackgroundQueue.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import { Fingerprinter } from './Fingerprinter.js';
import { PercentileCalculator } from './PercentileCalculator.js';
import type { AssignmentRepository, InsightsRepository, SubmissionRepository } from './repositories.js';
import { SimilarityAnalyzer } from './SimilarityAnalyzer.js';
import type { TextExtractor, UploadedFile } from './TextExtractor.js';
import type { Assignment, AssignmentInsights, CommonMistake, Histogram, Review, RubricCriterion, Submission } from './types.js';

export interface AssignmentInput {
  title: string;
  description: string;
  rubric: Omit<RubricCriterion, 'id'>[];
  dueAt?: Date;
}

export interface SubmissionView {
  submission: Submission;
  /** Null until MIN_CLASS_SIZE reviewed submissions exist, so a percentile never singles out a few students. */
  percentiles: { total: number; criteria: Record<string, number> } | null;
  classSize: number;
  commonMistakes: CommonMistake[];
}

export const MIN_CLASS_SIZE = 5;
/** Field test: a renamed copy scored 1.00, independent solutions ≤ 0.33 (see Fingerprinter). */
export const SIMILARITY_THRESHOLD = 0.5;

export class HomeworkAnalysisService {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly submissions: SubmissionRepository,
    private readonly insights: InsightsRepository,
    private readonly extractor: TextExtractor,
    private readonly reviewer: HomeworkReviewer,
    private readonly membership: Pick<CourseService, 'requireMember'>,
    private readonly queue: BackgroundQueue,
    private readonly clock: Clock,
  ) {}

  async createAssignment(course: Course, input: AssignmentInput): Promise<Assignment> {
    if (!input.title.trim()) throw new DomainError('INVALID_ASSIGNMENT', 'חסרה כותרת');
    if (input.rubric.length < 1 || input.rubric.length > 10) throw new DomainError('INVALID_ASSIGNMENT', 'מחוון צריך 1–10 קריטריונים');
    if (input.rubric.some((c) => !c.criterion.trim() || !(c.weight > 0))) throw new DomainError('INVALID_ASSIGNMENT', 'לכל קריטריון צריך שם ומשקל חיובי');
    return this.assignments.create({
      courseId: course.id,
      title: input.title.trim(),
      description: input.description.trim(),
      rubric: input.rubric.map((c, i) => ({ id: `c${i + 1}`, criterion: c.criterion.trim(), weight: c.weight, description: c.description.trim() })),
      dueAt: input.dueAt,
      createdAt: this.clock.now(),
    });
  }

  /** Text is extracted synchronously so an unreadable file is rejected at once; the AI review runs in the background. */
  async submit(assignment: Assignment, student: Participant, file: UploadedFile): Promise<Submission> {
    await this.membership.requireMember(assignment.courseId, student.studentNumber);
    const { text, kind } = await this.extractor.extract(file);
    const now = this.clock.now();
    const data = {
      assignmentId: assignment.id,
      studentId: student.id,
      studentNumber: student.studentNumber,
      studentName: student.name,
      filename: file.filename,
      status: 'processing' as const,
      error: '',
      review: null,
      total: null,
      late: !!assignment.dueAt && now > assignment.dueAt,
      submittedAt: now,
    };
    const existing = await this.submissions.findByAssignmentAndStudent(assignment.id, student.studentNumber);
    if (existing?.status === 'processing') throw new DomainError('REVIEW_IN_PROGRESS', 'ההגשה הקודמת עדיין בבדיקה');
    // Resubmission replaces the previous one: one submission per student keeps percentiles honest.
    const submission = existing
      ? await this.submissions.replaceFile(existing.id, data, file)
      : await this.submissions.createWithFile(data, file).catch(() => {
          // Double-click: the unique index (assignment, student) rejected the second concurrent create.
          throw new DomainError('REVIEW_IN_PROGRESS', 'ההגשה הקודמת עדיין בבדיקה');
        });
    await this.submissions.saveAnalysis(submission.id, text, Fingerprinter.sketch(text, kind));
    this.queue.add(`review ${submission.id}`, () => this.review(submission.id, text, assignment));
    return submission;
  }

  async review(submissionId: string, text: string, assignment: Assignment): Promise<void> {
    try {
      const review = await this.reviewer.review(text, assignment);
      await this.submissions.update(submissionId, { status: 'done', review, total: HomeworkAnalysisService.weightedTotal(review, assignment.rubric), error: '', reviewedAt: this.clock.now() });
    } catch (e) {
      console.error(`Review ${submissionId} failed:`, e);
      const error = e instanceof LLMOutputError ? 'ה-AI לא החזיר בדיקה תקינה — הגישו שוב' : 'הבדיקה נכשלה — הגישו שוב';
      await this.submissions.update(submissionId, { status: 'failed', error });
    }
  }

  static weightedTotal(review: Review, rubric: RubricCriterion[]): number {
    const weights = rubric.reduce((s, c) => s + c.weight, 0);
    const sum = rubric.reduce((s, c) => s + c.weight * (review.criteria.find((r) => r.id === c.id)?.score ?? 0), 0);
    return Math.round(sum / weights);
  }

  /** What a student (or the lecturer) sees for one submission: never other students' work or identities. */
  async view(submission: Submission): Promise<SubmissionView> {
    const done = (await this.submissions.listByAssignment(submission.assignmentId)).filter((s) => s.status === 'done' && s.review);
    const insights = await this.insights.findByAssignment(submission.assignmentId);
    let percentiles: SubmissionView['percentiles'] = null;
    if (submission.status === 'done' && submission.review && done.length >= MIN_CLASS_SIZE) {
      const criteria: Record<string, number> = {};
      for (const c of submission.review.criteria) {
        criteria[c.id] = PercentileCalculator.percentile(c.score, done.map((s) => s.review!.criteria.find((x) => x.id === c.id)?.score ?? 0));
      }
      percentiles = { total: PercentileCalculator.percentile(submission.total ?? 0, done.map((s) => s.total ?? 0)), criteria };
    }
    return { submission, percentiles, classSize: done.length, commonMistakes: insights?.commonMistakes ?? [] };
  }

  async buildInsights(assignment: Assignment): Promise<AssignmentInsights> {
    const done = (await this.submissions.listByAssignment(assignment.id)).filter((s) => s.status === 'done' && s.review);
    const criteria: AssignmentInsights['distribution']['criteria'] = {};
    for (const c of assignment.rubric) {
      const scores = done.map((s) => s.review!.criteria.find((x) => x.id === c.id)?.score ?? 0);
      criteria[c.id] = { mean: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0, histogram: HomeworkAnalysisService.histogram(scores) };
    }
    const commonMistakes = await this.reviewer.commonMistakes(done.map((s) => s.review!.mistakes), assignment);
    const sketches = await this.submissions.getFingerprints(assignment.id);
    const doneIds = new Set(done.map((s) => s.id));
    const similarPairs = SimilarityAnalyzer.pairsAbove(new Map([...sketches].filter(([id]) => doneIds.has(id))), SIMILARITY_THRESHOLD);
    return this.insights.upsert({
      assignmentId: assignment.id,
      submissionCount: done.length,
      distribution: { total: HomeworkAnalysisService.histogram(done.map((s) => s.total ?? 0)), criteria },
      commonMistakes,
      similarPairs,
      builtAt: this.clock.now(),
    });
  }

  static histogram(scores: number[]): Histogram {
    const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const counts = buckets.map(() => 0);
    for (const s of scores) counts[Math.min(9, Math.floor(s / 10))]++;
    return { buckets, counts };
  }

  async recoverInterrupted(): Promise<number> {
    const stuck = await this.submissions.listByStatus('processing');
    for (const s of stuck) await this.submissions.update(s.id, { status: 'failed', error: 'השרת הופעל מחדש באמצע הבדיקה — הגישו שוב' });
    return stuck.length;
  }

  async getInsights(assignmentId: string): Promise<AssignmentInsights | null> {
    return this.insights.findByAssignment(assignmentId);
  }

  listSubmissions(assignmentId: string): Promise<Submission[]> {
    return this.submissions.listByAssignment(assignmentId);
  }

  async getAssignment(id: string): Promise<Assignment> {
    const a = await this.assignments.get(id);
    if (!a) throw new NotFoundError('Assignment');
    return a;
  }

  async getSubmission(id: string): Promise<Submission> {
    const s = await this.submissions.get(id);
    if (!s) throw new NotFoundError('Submission');
    return s;
  }
}
