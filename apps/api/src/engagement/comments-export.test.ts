import { describe, expect, it } from 'vitest';
import { T0 } from '../test/fixtures.js';
import { CommentsExportService } from './CommentsExportService.js';
import type { FeedPost, LessonFeedback } from './types.js';

const post = (over: Partial<FeedPost>): FeedPost => ({
  id: 'p',
  courseId: 'c',
  sessionId: 's',
  authorNumber: '1',
  displayName: 'דנה',
  anonymous: false,
  text: 'q',
  votes: 0,
  answered: false,
  answer: '',
  postedAt: T0,
  ...over,
});
const fb = (rating: LessonFeedback['rating'], comment: string, n: string): LessonFeedback => ({ id: n, sessionId: 's', studentNumber: n, rating, comment, submittedAt: T0 });

describe('CommentsExportService.table', () => {
  it('questions by upvotes with their answers; names only when not anonymous', () => {
    const t = CommentsExportService.table([post({ text: 'a', votes: 1 }), post({ text: 'b', votes: 5, anonymous: true, displayName: null, answered: true, answer: 'כן' })], []);
    expect(t.rows).toEqual([
      ['שאלה', 'b', '', 5, 'כן', 'כן', ''],
      ['שאלה', 'a', 'דנה', 1, '', '', ''],
    ]);
  });

  it('end-of-lecture comments only from 3 answers, never with a name, sorted by rating and text instead of time', () => {
    expect(CommentsExportService.table([], [fb('clear', 'x', '1'), fb('unclear', 'y', '2')]).rows).toEqual([]);
    const rows = CommentsExportService.table([], [fb('unclear', 'ב', '1'), fb('clear', 'ג', '2'), fb('clear', 'א', '3')]).rows;
    expect(rows.map((r) => [r[1], r[2], r[6]])).toEqual([
      ['א', '', 'ברור ובקצב טוב'],
      ['ג', '', 'ברור ובקצב טוב'],
      ['ב', '', 'החומר לא היה ברור'],
    ]);
  });
});
