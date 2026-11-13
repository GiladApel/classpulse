import { HomeworkGuideGenerator, MAX_NOTES } from '../ai/HomeworkGuideGenerator.js';
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
import type { Assignment, AssignmentInsights, CommonMistake, GuideOutline, HomeworkReport, ReviewGuide, Submission } from './types.js';

export interface PublishInput {
  title: string;
  dueAt?: Date;
  sessionId?: string;
  /** The lecturer's instructions to the AI for the rubric. */
  notes?: string;
}

/** One row of the class chart (lecturer only): a graded hand-in. */
export interface ChartRow {
  studentName: string;
  studentNumber: string;
  submissionId: string;
  total: number;
  questions: Record<string, number>;
  sections: Record<string, number>;
}

export interface Chart {
  graded: number;
  rows: ChartRow[];
}

export interface SubmissionView {
  submission: Submission;
  /** For a student the requirements are removed: the rubric is the lecturer's. */
  outline: GuideOutline | null;
  checksLeft: number;
  commonMistakes: CommonMistake[];
}

export interface Rubric {
  guide: ReviewGuide | null;
  notes: string;
  /** Once someone has handed in, the rubric stays as it is, so every hand-in is graded against the same one. */
  locked: boolean;
}

export const MAX_CHECKS = 2;
/** Field test: a renamed copy scored 1.00, independent solutions ≤ 0.33 (see Fingerprinter). */
export const SIMILARITY_THRESHOLD = 0.5;

/**
 * Homework as a learning tool: the lecturer publishes a PDF (with optional instructions to the AI), the AI turns it into a
 * hidden rubric, and each student gets MAX_CHECKS feedback checks before handing in once. Practice files are never
 * stored; the handed-in files are, and the AI grades them as a draft only the lecturer sees.
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
    const notes = (input.notes ?? '').trim().slice(0, MAX_NOTES);
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
        notes,
      },
      pdf,
    );
    this.queue.add(`guide ${assignment.id}`, () => this.generateGuide(assignment.id, pdf.data, notes));
    return assignment;
  }

  async generateGuide(assignmentId: string, pdf: Buffer, notes = ''): Promise<void> {
    try {
      const guide = await this.generator.fromHomework({ mimeType: 'application/pdf', data: pdf }, notes);
      await this.assignments.saveGuide(assignmentId, guide, HomeworkGuideGenerator.outline(guide));
    } catch (e) {
      console.error(`Guide ${assignmentId} failed:`, e);
      const guideError = e instanceof LLMOutputError ? 'ה-AI לא הצליח לזהות שאלות בקובץ — נסו שוב או העלו PDF ברור יותר' : 'קריאת המטלה נכשלה — נסו שוב';
      await this.assignments.update(assignmentId, { guideStatus: 'failed', guideError });
    }
  }

  async retryGuide(assignment: Assignment): Promise<Assignment> {
    if (assignment.guideStatus !== 'failed') throw new ConflictError('GUIDE_NOT_FAILED', 'המטלה כבר מוכנה או בהכנה');
    return this.rebuild(assignment, assignment.notes);
  }

  /** The lecturer changes the instructions and the AI builds the rubric again from the stored PDF. */
  async regenerateRubric(assignment: Assignment, notes: string): Promise<Assignment> {
    if (assignment.guideStatus === 'generating') throw new ConflictError('GUIDE_IN_PROGRESS', 'המחוון עדיין נבנה');
    if (await this.locked(assignment.id)) throw new ConflictError('RUBRIC_LOCKED', 'כבר יש הגשות — המחוון נשאר כפי שהוא כדי שכולם ייבדקו לפיו');
    return this.rebuild(assignment, notes.trim().slice(0, MAX_NOTES));
  }

  async rubric(assignment: Assignment): Promise<Rubric> {
    return { guide: await this.assignments.getGuide(assignment.id), notes: assignment.notes, locked: await this.locked(assignment.id) };
  }

  private async rebuild(assignment: Assignment, notes: string): Promise<Assignment> {
    const pdf = await this.assignments.getFile(assignment.id);
    const updated = await this.assignments.update(assignment.id, { notes, guideStatus: 'generating', guideError: '' });
    this.queue.add(`guide ${assignment.id}`, () => this.generateGuide(assignment.id, pdf, notes));
    return updated;
  }

  private async locked(assignmentId: string): Promise<boolean> {
    return (await this.submissions.listByAssignment(assignmentId)).some((s) => s.handedInAt);
  }

  /** Removes the homework with its file, rubric, students' checks and hand-ins, and insights. */
  async remove(assignment: Assignment): Promise<void> {
    await this.assignments.delete(assignment.id);
  }

  /** Starts a practice check; the review runs in the background. A check that fails does not use one of the MAX_CHECKS. */
  async check(assignment: Assignment, student: Participant, solution: FileInput[]): Promise<Submission> {
    const existing = await this.ready(assignment, student);
    if ((existing?.checkCount ?? 0) >= MAX_CHECKS) throw new ConflictError('NO_CHECKS_LEFT', `ניצלת את ${MAX_CHECKS} הבדיקות של המטלה הזו`);

    const now = this.clock.now();
    const started = { status: 'processing' as const, error: '', submittedAt: now, late: !!assignment.dueAt && now > assignment.dueAt };
    const submission = existing ? await this.submissions.update(existing.id, started) : await this.createRow(assignment, student, started);
    this.queue.add(`check ${submission.id}`, () => this.review(submission.id, assignment, solution));
    return submission;
  }

  async review(submissionId: string, assignment: Assignment, solution: FileInput[]): Promise<void> {
    try {
      const { report, total } = await this.grade(assignment, solution, false);
      const current = await this.getSubmission(submissionId);
      await this.submissions.update(submissionId, { status: 'done', error: '', report, total, checkCount: current.checkCount + 1, reviewedAt: this.clock.now() });
    } catch (e) {
      console.error(`Check ${submissionId} failed:`, e);
      const error = e instanceof LLMOutputError ? 'ה-AI לא החזיר בדיקה תקינה — נסו שוב (הבדיקה לא נספרה)' : 'הבדיקה נכשלה — נסו שוב (הבדיקה לא נספרה)';
      await this.submissions.update(submissionId, { status: 'failed', error });
    }
  }

  /** The final hand-in: once per student. The files are stored and the AI grades them for the lecturer in the background. */
  async handIn(assignment: Assignment, student: Participant, files: FileInput[]): Promise<Submission> {
    const existing = await this.ready(assignment, student);
    const now = this.clock.now();
    const row = existing ?? (await this.createRow(assignment, student, { status: 'done', error: '', submittedAt: now, late: false }));
    const handed = await this.submissions.handIn(
      row.id,
      { handedInAt: now, late: !!assignment.dueAt && now > assignment.dueAt, finalStatus: 'processing', finalError: '' },
      files,
    );
    this.queue.add(`grade ${row.id}`, () => this.gradeFinal(row.id));
    return handed;
  }

  async gradeFinal(submissionId: string): Promise<void> {
    try {
      const submission = await this.getSubmission(submissionId);
      const assignment = await this.getAssignment(submission.assignmentId);
      const files = await this.submissions.getFiles(submissionId);
      const { report, total } = await this.grade(assignment, files, true);
      await this.submissions.update(submissionId, { finalStatus: 'done', finalError: '', finalReport: report, finalTotal: total });
      await this.fingerprint(submissionId, files);
    } catch (e) {
      console.error(`Grading ${submissionId} failed:`, e);
      const finalError = e instanceof LLMOutputError ? 'ה-AI לא החזיר בדיקה תקינה — אפשר לנסות שוב' : 'בדיקת ההגשה נכשלה — אפשר לנסות שוב';
      await this.submissions.update(submissionId, { finalStatus: 'failed', finalError });
    }
  }

  /** The handed-in files are stored, so a failed grading can simply run again. */
  async retryFinal(submission: Submission): Promise<Submission> {
    if (submission.finalStatus !== 'failed') throw new ConflictError('FINAL_NOT_FAILED', 'ההגשה כבר נבדקה או בבדיקה');
    const updated = await this.submissions.update(submission.id, { finalStatus: 'processing', finalError: '' });
    this.queue.add(`grade ${submission.id}`, () => this.gradeFinal(submission.id));
    return updated;
  }

  /** Membership, a ready rubric, no hand-in yet and no check running: the student's row, if any. */
  private async ready(assignment: Assignment, student: Participant): Promise<Submission | null> {
    await this.membership.requireMember(assignment.courseId, student.studentNumber);
    if (assignment.guideStatus !== 'ready') throw new ConflictError('GUIDE_NOT_READY', 'המטלה עוד לא מוכנה לבדיקה');
    const existing = await this.submissions.findByAssignmentAndStudent(assignment.id, student.studentNumber);
    if (existing?.handedInAt) throw new ConflictError('ALREADY_HANDED_IN', 'המטלה כבר הוגשה');
    if (existing?.status === 'processing') throw new ConflictError('CHECK_IN_PROGRESS', 'הבדיקה הקודמת עדיין רצה');
    return existing;
  }

  private createRow(assignment: Assignment, student: Participant, state: Pick<Submission, 'status' | 'error' | 'submittedAt' | 'late'>): Promise<Submission> {
    return this.submissions
      .create({
        ...state,
        assignmentId: assignment.id,
        studentId: student.id,
        studentNumber: student.studentNumber,
        studentName: student.name,
        checkCount: 0,
        report: null,
        total: null,
        files: [],
        finalError: '',
        finalReport: null,
        finalTotal: null,
      })
      .catch(() => {
        // Double-click: the unique index (assignment, student) rejected the second concurrent create.
        throw new ConflictError('CHECK_IN_PROGRESS', 'הבדיקה הקודמת עדיין רצה');
      });
  }

  private async grade(assignment: Assignment, files: FileInput[], final: boolean): Promise<{ report: HomeworkReport; total: number }> {
    const guide = await this.assignments.getGuide(assignment.id);
    if (!guide) throw new Error('guide missing');
    const { marks, mistakes } = await this.reviewer.reviewSolution(
      guide,
      files.map((f) => ({ mimeType: f.mimeType, data: f.data })),
      { notes: assignment.notes, final },
    );
    const outline = HomeworkGuideGenerator.outline(guide);
    return { report: { marks, questions: ScoreCalculator.questions(outline, marks), mistakes }, total: ScoreCalculator.total(outline, marks) };
  }

  /** Copy detection needs only a sketch of the text; a scanned PDF or photos simply have none. */
  private async fingerprint(submissionId: string, files: FileInput[]): Promise<void> {
    const texts: string[] = [];
    for (const f of files.filter((f) => f.mimeType === 'application/pdf')) {
      texts.push(await this.extractor.extract(f).then((r) => r.text, () => ''));
    }
    const text = texts.join('\n').trim();
    if (text) await this.submissions.saveFingerprint(submissionId, Fingerprinter.sketch(text, 'prose'));
  }

  /** One submission as its student or the lecturer sees it; the controller also drops the final grade for the student. */
  async view(submission: Submission, viewer: { lecturer: boolean }): Promise<SubmissionView> {
    const assignment = await this.getAssignment(submission.assignmentId);
    const insights = await this.insights.findByAssignment(submission.assignmentId);
    const outline = viewer.lecturer || !assignment.outline ? assignment.outline : HomeworkAnalysisService.questionsOnly(assignment.outline);
    return {
      submission,
      outline,
      checksLeft: submission.handedInAt ? 0 : Math.max(0, MAX_CHECKS - submission.checkCount),
      commonMistakes: insights?.commonMistakes ?? [],
    };
  }

  /** What a student may see of the rubric: the questions and what each section asks, as the homework PDF says it. */
  static questionsOnly(outline: GuideOutline): GuideOutline {
    return { questions: outline.questions.map((q) => ({ ...q, sections: q.sections.map((s) => ({ ...s, requirements: [] })) })) };
  }

  /** The class chart for the lecturer: every graded hand-in with its name, highest first. */
  async chart(assignment: Assignment): Promise<Chart> {
    const graded = await this.graded(assignment.id);
    const rows = graded
      .map(
        (s): ChartRow => ({
          studentName: s.studentName,
          studentNumber: s.studentNumber,
          submissionId: s.id,
          total: s.finalTotal ?? 0,
          questions: Object.fromEntries(s.finalReport!.questions.map((q) => [q.id, q.score])),
          sections: Object.fromEntries(s.finalReport!.marks.map((m) => [m.id, m.score])),
        }),
      )
      .sort((a, b) => b.total - a.total);
    return { graded: graded.length, rows };
  }

  async buildInsights(assignment: Assignment): Promise<AssignmentInsights> {
    const graded = await this.graded(assignment.id);
    const commonMistakes = await this.reviewer.commonMistakes(
      graded.map((s) => s.finalReport!.mistakes),
      assignment,
    );
    const sketches = await this.submissions.getFingerprints(assignment.id);
    const ids = new Set(graded.map((s) => s.id));
    const similarPairs = SimilarityAnalyzer.pairsAbove(new Map([...sketches].filter(([id]) => ids.has(id))), SIMILARITY_THRESHOLD);
    return this.insights.upsert({ assignmentId: assignment.id, submissionCount: graded.length, commonMistakes, similarPairs, builtAt: this.clock.now() });
  }

  /** After a restart, a check, a grading or a guide that was in flight is marked failed; a failed check is not counted. */
  async recoverInterrupted(): Promise<number> {
    const checks = await this.submissions.listByStatus('processing');
    for (const s of checks) await this.submissions.update(s.id, { status: 'failed', error: 'השרת הופעל מחדש באמצע הבדיקה — נסו שוב (הבדיקה לא נספרה)' });
    const finals = await this.submissions.listByFinalStatus('processing');
    for (const s of finals) await this.submissions.update(s.id, { finalStatus: 'failed', finalError: 'השרת הופעל מחדש באמצע בדיקת ההגשה — אפשר לנסות שוב' });
    const guides = await this.assignments.listByGuideStatus('generating');
    for (const a of guides) await this.assignments.update(a.id, { guideStatus: 'failed', guideError: 'השרת הופעל מחדש באמצע קריאת המטלה — נסו שוב' });
    return checks.length + finals.length + guides.length;
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

  /** Hand-ins the AI has graded. */
  private async graded(assignmentId: string): Promise<Submission[]> {
    return (await this.submissions.listByAssignment(assignmentId)).filter((s) => s.finalStatus === 'done' && s.finalReport !== null);
  }
}
