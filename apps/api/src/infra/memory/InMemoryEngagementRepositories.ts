import type { FeedPostRepository, LostSignalRepository, PollRepository, PollVoteRepository, PostVoteRepository } from '../../engagement/repositories.js';
import type { FeedPost, LostSignal, Poll, PollVote, PostVote } from '../../engagement/types.js';
import { InMemoryRepository } from '../InMemoryRepository.js';

export class InMemoryLostSignalRepository extends InMemoryRepository<LostSignal> implements LostSignalRepository {
  async lastFor(sessionId: string, studentNumber: string) {
    const mine = this.all().filter((s) => s.sessionId === sessionId && s.studentNumber === studentNumber);
    return mine.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
  }

  async listSince(sessionId: string, since: Date) {
    return this.all().filter((s) => s.sessionId === sessionId && s.at.getTime() >= since.getTime());
  }
}

export class InMemoryFeedPostRepository extends InMemoryRepository<FeedPost> implements FeedPostRepository {
  async listBySession(sessionId: string) {
    return this.all().filter((p) => p.sessionId === sessionId);
  }

  async incrementVotes(id: string) {
    const p = this.items.get(id);
    if (p) p.votes++;
  }
}

// Unique checks are synchronous so they behave like the DB's unique index under concurrency.
export class InMemoryPostVoteRepository extends InMemoryRepository<PostVote> implements PostVoteRepository {
  async create(data: Omit<PostVote, 'id'>) {
    if (this.all().some((v) => v.postId === data.postId && v.voterNumber === data.voterNumber)) throw new Error('UNIQUE constraint');
    return super.create(data);
  }

  async exists(postId: string, voterNumber: string) {
    return this.all().some((v) => v.postId === postId && v.voterNumber === voterNumber);
  }
}

export class InMemoryPollRepository extends InMemoryRepository<Poll> implements PollRepository {
  async findOpenBySession(sessionId: string) {
    return this.all().find((p) => p.sessionId === sessionId && p.status === 'open') ?? null;
  }
}

export class InMemoryPollVoteRepository extends InMemoryRepository<PollVote> implements PollVoteRepository {
  async create(data: Omit<PollVote, 'id'>) {
    if (this.all().some((v) => v.pollId === data.pollId && v.studentNumber === data.studentNumber)) throw new Error('UNIQUE constraint');
    return super.create(data);
  }

  async exists(pollId: string, studentNumber: string) {
    return this.all().some((v) => v.pollId === pollId && v.studentNumber === studentNumber);
  }

  async listByPoll(pollId: string) {
    return this.all().filter((v) => v.pollId === pollId);
  }
}
