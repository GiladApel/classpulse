import { HomeworkGuideGenerator } from '../ai/HomeworkGuideGenerator.js';
import type { HomeworkReviewer } from '../ai/HomeworkReviewer.js';
import { LLMOutputError } from '../ai/LLMProvider.js';
import type { CourseService } from '../attendance/CourseService.js';
import type { Course } from '../attendance/types.js';
import type { Participant } from '../engagement/types.js';
import type { BackgroundQueue } from '../infra/BackgroundQueue.js';
import type { Clock } from '../infra/Clock.js';
import { ConflictError, DomainError, NotFoundError } from '../shared/errors.js';
import { Fingerprinter } from './Fingerprinter.js';
import type { AssignmentRepository, FileInput, InsightsRepository, SubmissionRepository } from './repositories.js';
import { ScoreCalculator } from './ScoreCalculator.js';
import { SimilarityAnalyzer } from './SimilarityAnalyzer.js';
import type { TextExtractor } from './TextExtractor.js';
import type { Assignment, AssignmentInsights, CommonMistake, GuideOutline, Submission } from './types.js';

export interface PublishInput {
  title: string;
  dueAt?: Date;
  sessionId?: string;
}

/** One row of the class chart. Names are filled in for the lecturer only. */
export interface ChartRow {
  mine: boolean;
  studentName?: string;
  studentNumber?: string;
  submissionId?: string;
  total: number;
  questions: Record<string, number>;
  sections: Record<string, number>;
}

export interface Chart {
  /** Students see the chart only from MIN_CHART_SIZE checked students, so a few cannot be singled out. */
  visible: boolean;
  checked: number;
  rows: ChartRow[];
}

export interface SubmissionView {
  submission: Submission;
  outline: GuideOutline | null;
  /** Place among the checked students by total (ties share a place); null while the chart is hidden. */
  place: number | null;
  checked: number;
  checksLeft: number;
  commonMistakes: CommonMistake[];
}

export const MAX_CHECKS = 3;
export const MIN_CHART_SIZE = 3;
/** Field test: a renamed copy scored 1.00, independent solutions ≤ 0.33 (see Fingerprinter). */
export const SIMILARITY_THRESHOLD = 0.5;

/**
 * Homework as a learning tool: the lecturer publishes a PDF, the AI turns it into a fixed review guide, and each student
 * checks their solution before handing it in (up to MAX_CHECKS times) and gets a per-section report and their place in
 * the class. The solution file itself is never stored: it lives only in the background job that reviews it.
 */
export class HomeworkAnalysisService {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly submissions: SubmissionRepository,
    private readonly insights: InsightsRepository,
    private readonly extractor: TextExtractor,
    private readonly generator: Pick<HomeworkGuideGenerator, 'fromHomework'>,
    private readonly reviewer: Pick<HomeworkReviewer, 'reviewSolution' | 'commonMistakes'>,
    private readonly membership: Pick<CourseService, 'requireMember'>,
    private readonly queue: BackgroundQueue,
    private readonly clock: Clock,
  ) {}

  async publish(course: Course, input: PublishInput, pdf: FileInput): Promise<Assignment> {
    const title = input.title.trim();
    if (!title) throw new DomainError('INVALID_ASSIGNMENT', 'חסרה כותרת');
    const assignment = await this.assignments.createWithFile(
      {
        courseId: course.id,
        sessionId: input.sessionId,
        title,
        dueAt: input.dueAt,
        createdAt: this.clock.now(),
        guideStatus: 'generating',
        guideError: '',
        outline: null,
      },
      pdf,
    );
    this.queue.add(`guide ${assignment.id}`, () => this.generateGuide(assignment.id, pdf.data));
    return assignment;
  }

  async generateGuide(assignmentId: string, pdf: Buffer): Promise<void> {
    try {
      const guide = await this.generator.fromHomework({ mimeType: 'application/pdf', data: pdf });
      await this.assignments.saveGuide(assignmentId, guide, HomeworkGuideGenerator.outline(guide));
    } catch (e) {
      console.error(`Guide ${assignmentId} failed:`, e);
      const guideError = e instanceof LLMOutputError ? 'ה-AI לא הצליח לזהות שאלות בקובץ — נסו שוב או העלו PDF ברור יותר' : 'קריאת המטלה נכשלה — נסו שוב';
      await this.assignments.update(assignmentId, { guideStatus: 'failed', guideError });
    }
  }

  async retryGuide(assignment: Assignment): Promise<Assignment> {
    if (assignment.guideStatus !== 'failed') throw new ConflictError('GUIDE_NOT_FAILED', 'המטלה כבר מוכנה או בהכנה');
    const pdf = await this.assignments.getFile(assignment.id);
    const updated = await this.assignments.update(assignment.id, { guideStatus: 'generating', guideError: '' });
    this.queue.add(`guide ${assignment.id}`, () => this.generateGuide(assignment.id, pdf));
    return updated;
  }

  /** Removes the homework with its file, guide, students' checks and insights. */
  async remove(assignment: Assignment): Promise<void> {
    await this.assignments.delete(assignment.id);
  }

  /** Starts a check; the review runs in the background. A check that fails does not use one of the MAX_CHECKS. */
  async check(assignment: Assignment, student: Participant, solution: FileInput[]): Promise<Submission> {
    await this.membership.requireMember(assignment.courseId, student.studentNumber);
    if (assignment.guideStatus !== 'ready') throw new ConflictError('GUIDE_NOT_READY', 'המטלה עוד לא מוכנה לבדיקה');
    const existing = await this.submissions.findByAssignmentAndStudent(assignment.id, student.studentNumber);
    if (existing?.status === 'processing') throw new ConflictError('CHECK_IN_PROGRESS', 'הבדיקה הקודמת עדיין רצה');
    if ((existing?.checkCount ?? 0) >= MAX_CHECKS) throw new ConflictError('NO_CHECKS_LEFT', `ניצלת את ${MAX_CHECKS} הבדיקות של המטלה הזו`);

    const now = this.clock.now();
    const started = { status: 'processing' as const, error: '', submittedAt: now, late: !!assignment.dueAt && now > assignment.dueAt };
    const submission = existing
      ? await this.submissions.update(existing.id, started)
      : await this.submissions
          .create({ ...started, assignmentId: assignment.id, studentId: student.id, studentNumber: student.studentNumber, studentName: student.name, checkCount: 0, report: null, total: null })
          .catch(() => {
            // Double-click: the unique index (assignment, student) rejected the second concurrent create.
            throw new ConflictError('CHECK_IN_PROGRESS', 'הבדיקה הקודמת עדיין רצה');
          });
    this.queue.add(`check ${submission.id}`, () => this.review(submission.id, assignment, solution));
    return submission;
  }

  async review(submissionId: string, assignment: Assignment, solution: FileInput[]): Promise<void> {
    try {
      const guide = await this.assignments.getGuide(assignment.id);
      if (!guide) throw new Error('guide missing');
      const { marks, mistakes } = await this.reviewer.reviewSolution(
        guide,
        solution.map((f) => ({ mimeType: f.mimeType, data: f.data })),
      );
      const outline = HomeworkGuideGenerator.outline(guide);
      const current = await this.getSubmission(submissionId);
      await this.submissions.update(submissionId, {
        status: 'done',
        error: '',
        report: { marks, questions: ScoreCalculator.questions(outline, marks), mistakes },
        total: ScoreCalculator.total(outline, marks),
        checkCount: current.checkCount + 1,
        reviewedAt: this.clock.now(),
      });
      await this.fingerprint(submissionId, solution);
    } catch (e) {
      console.error(`Check ${submissionId} failed:`, e);
      const error = e instanceof LLMOutputError ? 'ה-AI לא החזיר בדיקה תקינה — נסו שוב (הבדיקה לא נספרה)' : 'הבדיקה נכשלה — נסו שוב (הבדיקה לא נספרה)';
      await this.submissions.update(submissionId, { status: 'failed', error });
    }
  }

  /** Copy detection needs only a sketch of the text; a scanned PDF or photos simply have none. */
  private async fingerprint(submissionId: string, solution: FileInput[]): Promise<void> {
    const texts: string[] = [];
    for (const f of solution.filter((f) => f.mimeType === 'application/pdf')) {
      texts.push(await this.extractor.extract(f).then((r) => r.text, () => ''));
    }
    const text = texts.join('\n').trim();
    if (text) await this.submissions.saveFingerprint(submissionId, Fingerprinter.sketch(text, 'prose'));
  }

  /** What a student (or the lecturer) sees for one submission: never other students' work or identities. */
  async view(submission: Submission): Promise<SubmissionView> {
    const assignment = await this.getAssignment(submission.assignmentId);
    const done = await this.checked(submission.assignmentId);
    const mine = done.findIndex((s) => s.id === submission.id);
    const place = mine >= 0 && done.length >= MIN_CHART_SIZE ? ScoreCalculator.places(done.map((s) => s.total ?? 0))[mine] : null;
    const insights = await this.insights.findByAssignment(submission.assignmentId);
    return {
      submission,
      outline: assignment.outline,
      place,
      checked: done.length,
      checksLeft: Math.max(0, MAX_CHECKS - submission.checkCount),
      commonMistakes: insights?.commonMistakes ?? [],
    };
  }

  requireMember(assignment: Assignment, student: Participant): Promise<void> {
    return this.membership.requireMember(assignment.courseId, student.studentNumber);
  }

  /** The class chart: every checked student's latest result, highest first. Names only for the lecturer. */
  async chart(assignment: Assignment, viewer: { lecturer: boolean; studentNumber: string }): Promise<Chart> {
    const done = await this.checked(assignment.id);
    const visible = viewer.lecturer || done.length >= MIN_CHART_SIZE;
    const rows = visible
      ? done
          .map(
            (s): ChartRow => ({
              mine: s.studentNumber === viewer.studentNumber,
              ...(viewer.lecturer ? { studentName: s.studentName, studentNumber: s.studentNumber, submissionId: s.id } : {}),
              total: s.total ?? 0,
              questions: Object.fromEntries(s.report!.questions.map((q) => [q.id, q.score])),
              sections: Object.fromEntries(s.report!.marks.map((m) => [m.id, m.score])),
            }),
          )
          .sort((a, b) => b.total - a.total)
      : [];
    return { visible, checked: done.length, rows };
  }

  async buildInsights(assignment: Assignment): Promise<AssignmentInsights> {
    const done = await this.checked(assignment.id);
    const commonMistakes = await this.reviewer.commonMistakes(
      done.map((s) => s.report!.mistakes),
      assignment,
    );
    const sketches = await this.submissions.getFingerprints(assignment.id);
    const doneIds = new Set(done.map((s) => s.id));
    const similarPairs = SimilarityAnalyzer.pairsAbove(new Map([...sketches].filter(([id]) => doneIds.has(id))), SIMILARITY_THRESHOLD);
    return this.insights.upsert({ assignmentId: assignment.id, submissionCount: done.length, commonMistakes, similarPairs, builtAt: this.clock.now() });
  }

  /** After a restart, a check or a guide that was in flight is marked failed; a failed check is not counted. */
  async recoverInterrupted(): Promise<number> {
    const checks = await this.submissions.listByStatus('processing');
    for (const s of checks) await this.submissions.update(s.id, { status: 'failed', error: 'השרת הופעל מחדש באמצע הבדיקה — נסו שוב (הבדיקה לא נספרה)' });
    const guides = await this.assignments.listByGuideStatus('generating');
    for (const a of guides) await this.assignments.update(a.id, { guideStatus: 'failed', guideError: 'השרת הופעל מחדש באמצע קריאת המטלה — נסו שוב' });
    return checks.length + guides.length;
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

  /** Students with at least one successful check: their latest result counts, even if a later retry failed. */
  private async checked(assignmentId: string): Promise<Submission[]> {
    return (await this.submissions.listByAssignment(assignmentId)).filter((s) => s.report !== null && s.total !== null);
  }
}
