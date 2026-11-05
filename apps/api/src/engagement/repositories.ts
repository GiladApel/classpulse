import type { Repository } from '../infra/Repository.js';
import type { FeedPost, LostSignal, Poll, PollVote, PostVote } from './types.js';

export interface LostSignalRepository {
  create(data: Omit<LostSignal, 'id'>): Promise<LostSignal>;
  lastFor(sessionId: string, studentNumber: string): Promise<LostSignal | null>;
  listSince(sessionId: string, since: Date): Promise<LostSignal[]>;
}

export interface FeedPostRepository extends Repository<FeedPost> {
  listBySession(sessionId: string): Promise<FeedPost[]>;
  /** Atomic increment so concurrent upvotes are not lost. */
  incrementVotes(id: string): Promise<void>;
}

export interface PostVoteRepository {
  /** Throws on a duplicate (post, voterNumber). */
  create(data: Omit<PostVote, 'id'>): Promise<PostVote>;
  exists(postId: string, voterNumber: string): Promise<boolean>;
}

export interface PollRepository extends Repository<Poll> {
  findOpenBySession(sessionId: string): Promise<Poll | null>;
}

export interface PollVoteRepository {
  /** Throws on a duplicate (poll, studentNumber). */
  create(data: Omit<PollVote, 'id'>): Promise<PollVote>;
  exists(pollId: string, studentNumber: string): Promise<boolean>;
  listByPoll(pollId: string): Promise<PollVote[]>;
}
