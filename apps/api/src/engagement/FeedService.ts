import type { FeedClusterer } from '../ai/FeedClusterer.js';
import type { CourseService } from '../attendance/CourseService.js';
import type { LessonParticipation } from '../attendance/LessonAccess.js';
import type { Course, Session } from '../attendance/types.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import type { FeedPostRepository, PostVoteRepository } from './repositories.js';
import type { FeedPost, Participant, Theme } from './types.js';

export class FeedService {
  constructor(
    private readonly posts: FeedPostRepository,
    private readonly votes: PostVoteRepository,
    private readonly attendance: LessonParticipation,
    private readonly courses: Pick<CourseService, 'requireMember'>,
    private readonly clusterer: FeedClusterer,
    private readonly clock: Clock,
  ) {}

  /** A lesson's questions are asked while it is live; afterwards questions go to the course forum (FR-BC-02). */
  async post(session: Session, author: Participant, text: string, anonymous: boolean): Promise<FeedPost> {
    if (session.status !== 'active') throw new DomainError('SESSION_ENDED', 'השיעור הסתיים — אפשר לשאול בפורום של הקורס');
    await this.attendance.requireParticipant(session.id, author.studentNumber);
    return this.create(session.courseId, session.id, author, text, anonymous);
  }

  /** The course forum: any course member, at any time. */
  async postToCourse(course: Course, author: Participant, text: string, anonymous: boolean): Promise<FeedPost> {
    await this.courses.requireMember(course.id, author.studentNumber);
    return this.create(course.id, undefined, author, text, anonymous);
  }

  private create(courseId: string, sessionId: string | undefined, author: Participant, text: string, anonymous: boolean): Promise<FeedPost> {
    return this.posts.create({
      courseId,
      sessionId,
      authorId: author.id,
      authorNumber: author.studentNumber,
      displayName: anonymous ? null : author.name,
      anonymous,
      text,
      votes: 0,
      answered: false,
      answer: '',
      postedAt: this.clock.now(),
    });
  }

  async upvote(postId: string, voter: Participant): Promise<void> {
    const post = await this.get(postId);
    if (post.sessionId) await this.attendance.requireParticipant(post.sessionId, voter.studentNumber);
    else await this.courses.requireMember(post.courseId, voter.studentNumber);
    if (await this.votes.exists(postId, voter.studentNumber)) throw new DomainError('ALREADY_VOTED', 'כבר הצבעת לשאלה הזו');
    try {
      await this.votes.create({ postId, voterId: voter.id, voterNumber: voter.studentNumber });
    } catch {
      // Lost a race against the same voter's concurrent request; the unique index rejected the second one.
      throw new DomainError('ALREADY_VOTED', 'כבר הצבעת לשאלה הזו');
    }
    await this.posts.incrementVotes(postId);
  }

  async markAnswered(postId: string, answered: boolean): Promise<FeedPost> {
    await this.get(postId);
    return this.posts.update(postId, { answered });
  }

  /** FR-LP-04: a written answer, during or after the lecture. Writing one marks the post answered; clearing it keeps the flag. */
  async answer(postId: string, text: string): Promise<FeedPost> {
    await this.get(postId);
    const answer = text.trim();
    return this.posts.update(postId, answer ? { answer, answered: true } : { answer });
  }

  /** FR-BC-04: AI grouping of open posts. Fewer than 2 posts is not worth a model call. */
  async clusterOpen(sessionId: string): Promise<Theme[]> {
    const open = (await this.posts.listBySession(sessionId)).filter((p) => !p.answered);
    if (open.length < 2) return open.map((p) => ({ title: p.text.slice(0, 60), summary: '', postIds: [p.id] }));
    return this.clusterer.cluster(open);
  }

  async get(postId: string): Promise<FeedPost> {
    const post = await this.posts.get(postId);
    if (!post) throw new NotFoundError('Post');
    return post;
  }
}
