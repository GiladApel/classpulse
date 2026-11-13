import type { FeedClusterer } from '../ai/FeedClusterer.js';
import type { LessonParticipation } from '../attendance/LessonAccess.js';
import type { Session } from '../attendance/types.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import type { FeedPostRepository, PostVoteRepository } from './repositories.js';
import type { FeedPost, Participant, Theme } from './types.js';

export class FeedService {
  constructor(
    private readonly posts: FeedPostRepository,
    private readonly votes: PostVoteRepository,
    private readonly attendance: LessonParticipation,
    private readonly clusterer: FeedClusterer,
    private readonly clock: Clock,
  ) {}

  /** Allowed during and after the lecture (FR-BC-02), so the session may already be ended. */
  async post(session: Session, author: Participant, text: string, anonymous: boolean): Promise<FeedPost> {
    await this.attendance.requireParticipant(session.id, author.studentNumber);
    return this.posts.create({
      sessionId: session.id,
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
    await this.attendance.requireParticipant(post.sessionId, voter.studentNumber);
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
