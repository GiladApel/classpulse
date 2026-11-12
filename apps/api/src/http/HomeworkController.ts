import { Hono } from 'hono';
import type { SessionService } from '../attendance/SessionService.js';
import type { HomeworkAnalysisService } from '../content/HomeworkAnalysisService.js';
import type { FileInput } from '../content/repositories.js';
import type { Assignment, AssignmentInsights, Submission } from '../content/types.js';
import { ForbiddenError } from '../shared/errors.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { participant } from './EngagementController.js';
import { ValidationError } from './errors.js';

export const MAX_HOMEWORK_BYTES = 20 * 1024 * 1024;
export const MAX_SOLUTION_BYTES = 20 * 1024 * 1024;
export const MAX_SOLUTION_IMAGES = 10;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const assignmentDto = (a: Assignment) => ({
  id: a.id,
  courseId: a.courseId,
  sessionId: a.sessionId ?? null,
  title: a.title,
  dueAt: a.dueAt?.toISOString() ?? null,
  guideStatus: a.guideStatus,
  guideError: a.guideError,
  outline: a.outline,
});

export const submissionDto = (s: Submission) => ({
  id: s.id,
  assignmentId: s.assignmentId,
  studentNumber: s.studentNumber,
  studentName: s.studentName,
  status: s.status,
  error: s.error,
  checkCount: s.checkCount,
  report: s.report,
  total: s.total,
  late: s.late,
  submittedAt: s.submittedAt.toISOString(),
  reviewedAt: s.reviewedAt?.toISOString() ?? null,
});

const toInput = async (f: File): Promise<FileInput> => ({ data: Buffer.from(await f.arrayBuffer()), filename: f.name.slice(0, 200), mimeType: f.type });

export class HomeworkController {
  constructor(
    private readonly homework: HomeworkAnalysisService,
    private readonly sessions: SessionService,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    // Multipart {title, file (PDF), dueAt?, sessionId?}: the AI reads the PDF in the background.
    app.post('/courses/:id/assignments', requireLecturer, async (c) => {
      const course = await this.sessions.getOwnedCourse(c.req.param('id'), c.get('user').id);
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File) || file.size === 0) throw new ValidationError('file is required');
      if (file.type !== 'application/pdf') throw new ValidationError('המטלה צריכה להיות קובץ PDF');
      if (file.size > MAX_HOMEWORK_BYTES) throw new ValidationError('הקובץ גדול מ-20MB');
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
      const dueAt = typeof body.dueAt === 'string' && body.dueAt ? new Date(body.dueAt) : undefined;
      if (dueAt && Number.isNaN(dueAt.getTime())) throw new ValidationError('dueAt must be an ISO date');
      let sessionId: string | undefined;
      if (typeof body.sessionId === 'string' && body.sessionId) {
        const session = await this.sessions.get(body.sessionId);
        if (session.courseId !== course.id) throw new ValidationError('the lesson is not in this course');
        sessionId = session.id;
      }
      const assignment = await this.homework.publish(course, { title, dueAt, sessionId }, await toInput(file));
      return c.json(assignmentDto(assignment), 201);
    });

    app.post('/assignments/:id/guide/retry', requireLecturer, async (c) => {
      const assignment = await this.ownedAssignment(c.req.param('id'), c.get('user').id);
      return c.json(assignmentDto(await this.homework.retryGuide(assignment)));
    });

    app.delete('/assignments/:id', requireLecturer, async (c) => {
      const assignment = await this.ownedAssignment(c.req.param('id'), c.get('user').id);
      await this.homework.remove(assignment);
      return c.json({ ok: true });
    });

    // Multipart files[]: one PDF, or up to MAX_SOLUTION_IMAGES photos of a handwritten solution.
    app.post('/assignments/:id/checks', async (c) => {
      const student = participant(c.get('user'));
      const assignment = await this.homework.getAssignment(c.req.param('id'));
      const files = ((await c.req.parseBody({ all: true }))['files'] ?? []) as unknown;
      const list = (Array.isArray(files) ? files : [files]).filter((f): f is File => f instanceof File && f.size > 0);
      if (list.length === 0) throw new ValidationError('files are required');
      const pdfs = list.filter((f) => f.type === 'application/pdf');
      const images = list.filter((f) => IMAGE_TYPES.includes(f.type));
      if (pdfs.length + images.length !== list.length) throw new ValidationError('אפשר להעלות PDF או תמונות (JPG, PNG)');
      if (pdfs.length > 1 || (pdfs.length === 1 && images.length > 0)) throw new ValidationError('העלו קובץ PDF אחד, או תמונות');
      if (images.length > MAX_SOLUTION_IMAGES) throw new ValidationError(`עד ${MAX_SOLUTION_IMAGES} תמונות`);
      if (list.reduce((sum, f) => sum + f.size, 0) > MAX_SOLUTION_BYTES) throw new ValidationError('הקבצים גדולים מ-20MB');
      const submission = await this.homework.check(assignment, student, await Promise.all(list.map(toInput)));
      return c.json(submissionDto(submission), 202);
    });

    // A student may read only their own submission; the lecturer any submission in their course.
    app.get('/submissions/:id', async (c) => {
      const user = c.get('user');
      const submission = await this.homework.getSubmission(c.req.param('id'));
      if (submission.studentId !== user.id) {
        if (user.role !== 'lecturer') throw new ForbiddenError('Not your submission');
        await this.ownedAssignment(submission.assignmentId, user.id);
      }
      const view = await this.homework.view(submission);
      return c.json({ ...view, submission: submissionDto(view.submission) });
    });

    // Course members see anonymous rows (their own marked); the course's lecturer sees names.
    app.get('/assignments/:id/chart', async (c) => {
      const user = c.get('user');
      const assignment = await this.homework.getAssignment(c.req.param('id'));
      const lecturer = user.role === 'lecturer';
      if (lecturer) await this.sessions.getOwnedCourse(assignment.courseId, user.id);
      else await this.homework.requireMember(assignment, participant(user));
      return c.json(await this.homework.chart(assignment, { lecturer, studentNumber: user.studentNumber }));
    });

    app.post('/assignments/:id/insights', requireLecturer, async (c) => {
      const assignment = await this.ownedAssignment(c.req.param('id'), c.get('user').id);
      return c.json(await this.lecturerInsights(assignment.id, await this.homework.buildInsights(assignment)));
    });

    app.get('/assignments/:id/insights', requireLecturer, async (c) => {
      const assignment = await this.ownedAssignment(c.req.param('id'), c.get('user').id);
      return c.json(await this.lecturerInsights(assignment.id, await this.homework.getInsights(assignment.id)));
    });

    return app;
  }

  private async ownedAssignment(id: string, lecturerId: string): Promise<Assignment> {
    const assignment = await this.homework.getAssignment(id);
    await this.sessions.getOwnedCourse(assignment.courseId, lecturerId);
    return assignment;
  }

  /** Similar pairs name the students so the lecturer can review them by hand; nothing here is ever sent to students. */
  private async lecturerInsights(assignmentId: string, insights: AssignmentInsights | null) {
    if (!insights) return null;
    const byId = new Map((await this.homework.listSubmissions(assignmentId)).map((s) => [s.id, s]));
    const who = (id: string) => ({ submissionId: id, studentName: byId.get(id)?.studentName ?? '?', studentNumber: byId.get(id)?.studentNumber ?? '?' });
    return {
      submissionCount: insights.submissionCount,
      commonMistakes: insights.commonMistakes,
      similarPairs: insights.similarPairs.map((p) => ({ a: who(p.a), b: who(p.b), similarity: p.similarity })),
      builtAt: insights.builtAt.toISOString(),
    };
  }
}
