import { Hono } from 'hono';
import type { SessionService } from '../attendance/SessionService.js';
import type { HomeworkAnalysisService } from '../content/HomeworkAnalysisService.js';
import type { Assignment, AssignmentInsights, Submission } from '../content/types.js';
import { ForbiddenError } from '../shared/errors.js';
import { type AppEnv, requireLecturer } from './auth.js';
import { participant } from './EngagementController.js';
import { ValidationError } from './errors.js';
import { jsonBody, str } from './validate.js';

const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024;

export const assignmentDto = (a: Assignment) => ({
  id: a.id,
  courseId: a.courseId,
  title: a.title,
  description: a.description,
  rubric: a.rubric,
  dueAt: a.dueAt?.toISOString() ?? null,
});

export const submissionDto = (s: Submission) => ({
  id: s.id,
  assignmentId: s.assignmentId,
  studentNumber: s.studentNumber,
  studentName: s.studentName,
  filename: s.filename,
  status: s.status,
  error: s.error,
  review: s.review,
  total: s.total,
  late: s.late,
  submittedAt: s.submittedAt.toISOString(),
});

export class HomeworkController {
  constructor(
    private readonly homework: HomeworkAnalysisService,
    private readonly sessions: SessionService,
  ) {}

  routes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.post('/courses/:id/assignments', requireLecturer, async (c) => {
      const course = await this.sessions.getOwnedCourse(c.req.param('id'), c.get('user').id);
      const b = await jsonBody(c.req);
      if (!Array.isArray(b.rubric)) throw new ValidationError('rubric must be an array');
      const rubric = (b.rubric as Record<string, unknown>[]).map((r) => {
        if (!r || typeof r !== 'object' || typeof r.weight !== 'number') throw new ValidationError('each rubric item needs criterion, weight, description');
        return { criterion: str(r, 'criterion', { max: 120 }), weight: r.weight, description: str(r, 'description', { max: 500, optional: true }) };
      });
      const dueRaw = str(b, 'dueAt', { optional: true });
      const dueAt = dueRaw ? new Date(dueRaw) : undefined;
      if (dueAt && Number.isNaN(dueAt.getTime())) throw new ValidationError('dueAt must be an ISO date');
      const assignment = await this.homework.createAssignment(course, {
        title: str(b, 'title', { max: 200 }),
        description: str(b, 'description', { max: 5000, optional: true }),
        rubric,
        dueAt,
      });
      return c.json(assignmentDto(assignment), 201);
    });

    app.post('/assignments/:id/submissions', async (c) => {
      const student = participant(c.get('user'));
      const assignment = await this.homework.getAssignment(c.req.param('id'));
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) throw new ValidationError('file is required');
      if (file.size > MAX_SUBMISSION_BYTES) throw new ValidationError('הקובץ גדול מ-10MB');
      const submission = await this.homework.submit(assignment, student, {
        data: Buffer.from(await file.arrayBuffer()),
        filename: file.name.slice(0, 200),
        mimeType: file.type,
      });
      return c.json(submissionDto(submission), 202);
    });

    // A student may read only their own submission; the lecturer any submission in their course.
    app.get('/submissions/:id', async (c) => {
      const user = c.get('user');
      const submission = await this.homework.getSubmission(c.req.param('id'));
      if (submission.studentId !== user.id) {
        if (user.role !== 'lecturer') throw new ForbiddenError('Not your submission');
        const assignment = await this.homework.getAssignment(submission.assignmentId);
        await this.sessions.getOwnedCourse(assignment.courseId, user.id);
      }
      const view = await this.homework.view(submission);
      return c.json({ ...view, submission: submissionDto(view.submission) });
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
      distribution: insights.distribution,
      commonMistakes: insights.commonMistakes,
      similarPairs: insights.similarPairs.map((p) => ({ a: who(p.a), b: who(p.b), similarity: p.similarity })),
      builtAt: insights.builtAt.toISOString(),
    };
  }
}
