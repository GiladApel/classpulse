import type { CourseRepository } from '../attendance/repositories.js';
import type { Session } from '../attendance/types.js';
import type { ExportFormat, ExportOutput, SpreadsheetExporter, Table } from '../infra/export/SpreadsheetExporter.js';
import { DomainError } from '../shared/errors.js';
import { MIN_FEEDBACK_RESPONSES } from './FeedbackService.js';
import type { FeedPostRepository, LessonFeedbackRepository } from './repositories.js';
import type { FeedbackRating, FeedPost, LessonFeedback } from './types.js';

const RATING: Record<FeedbackRating, string> = { clear: 'ברור ובקצב טוב', too_fast: 'מהיר מדי', too_slow: 'איטי מדי', unclear: 'החומר לא היה ברור' };
export const COMMENT_HEADERS = ['סוג', 'טקסט', 'שם', 'הצבעות', 'נענה', 'תשובת המרצה', 'דירוג'];

/**
 * A lecture's comments as a spreadsheet for the lecturer: the students' questions with their answers, and the anonymous
 * end-of-lecture comments. The comments follow the screen's rules: none below MIN_FEEDBACK_RESPONSES answers, no names,
 * no times, and an order (by rating, then text) that says nothing about who wrote them.
 */
export class CommentsExportService {
  constructor(
    private readonly posts: Pick<FeedPostRepository, 'listBySession'>,
    private readonly feedback: Pick<LessonFeedbackRepository, 'listBySession'>,
    private readonly courses: Pick<CourseRepository, 'get'>,
    private readonly exporters: Map<ExportFormat, SpreadsheetExporter>,
  ) {}

  async export(session: Session, format: ExportFormat): Promise<ExportOutput> {
    const exporter = this.exporters.get(format);
    if (!exporter) throw new DomainError('EXPORT_UNAVAILABLE', `Export format ${format} is not configured`);
    const [posts, feedback, course] = await Promise.all([this.posts.listBySession(session.id), this.feedback.listBySession(session.id), this.courses.get(session.courseId)]);
    return exporter.export(CommentsExportService.table(posts, feedback), { title: session.title, courseName: course?.name ?? '', startedAt: session.startedAt });
  }

  static table(posts: FeedPost[], feedback: LessonFeedback[]): Table {
    const questions = [...posts]
      .sort((a, b) => b.votes - a.votes || a.postedAt.getTime() - b.postedAt.getTime())
      .map((p) => ['שאלה', p.text, p.anonymous ? '' : (p.displayName ?? ''), p.votes, p.answered ? 'כן' : '', p.answer, '']);
    const comments =
      feedback.length < MIN_FEEDBACK_RESPONSES
        ? []
        : [...feedback]
            .sort((a, b) => a.rating.localeCompare(b.rating) || a.comment.localeCompare(b.comment, 'he'))
            .map((f) => ['הערה על השיעור', f.comment, '', '', '', '', RATING[f.rating]]);
    return { name: 'הערות', suffix: 'הערות', headers: COMMENT_HEADERS, rows: [...questions, ...comments], widths: [14, 50, 16, 8, 6, 40, 18] };
  }
}
