import { pb } from './pb';

/** Which forum: a lesson's questions, or the course forum (posts with no lesson). */
export type FeedScope = { sessionId: string } | { courseId: string };

export const feedFilter = (scope: FeedScope) =>
  'sessionId' in scope ? pb.filter('session = {:s}', { s: scope.sessionId }) : pb.filter('course = {:c} && session = ""', { c: scope.courseId });

export const myVotesFilter = (scope: FeedScope, userId: string) =>
  'sessionId' in scope
    ? pb.filter('voter = {:u} && post.session = {:s}', { u: userId, s: scope.sessionId })
    : pb.filter('voter = {:u} && post.course = {:c} && post.session = ""', { u: userId, c: scope.courseId });

export const postUrl = (scope: FeedScope) => ('sessionId' in scope ? `/sessions/${scope.sessionId}/posts` : `/courses/${scope.courseId}/posts`);
