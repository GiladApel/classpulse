import type { RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { FeedPostRepository, LostSignalRepository, PollRepository, PollVoteRepository, PostVoteRepository } from '../../engagement/repositories.js';
import type { FeedPost, LostSignal, Poll, PollResults, PollVote, PostVote } from '../../engagement/types.js';
import { KeyedLock } from '../KeyedLock.js';
import { compact, PbRepository, toDate } from './PbRepository.js';

export class PbLostSignalRepository extends PbRepository<LostSignal> implements LostSignalRepository {
  constructor(pb: PocketBase) {
    super(pb, 'lost_signals');
  }

  async lastFor(sessionId: string, studentNumber: string) {
    const page = await this.col.getList(1, 1, { filter: this.pb.filter('session = {:s} && student_number = {:n}', { s: sessionId, n: studentNumber }), sort: '-at' });
    return page.items[0] ? this.toEntity(page.items[0]) : null;
  }

  async listSince(sessionId: string, since: Date) {
    const list = await this.col.getFullList({ filter: this.pb.filter('session = {:s} && at >= {:since}', { s: sessionId, since }) });
    return list.map((r) => this.toEntity(r));
  }

  protected toEntity(r: RecordModel): LostSignal {
    return { id: r.id, sessionId: r.session, studentId: r.student || undefined, studentNumber: r.student_number, at: toDate(r.at)! };
  }

  protected toRecord(d: Partial<Omit<LostSignal, 'id'>>) {
    return compact({ session: d.sessionId, student: d.studentId, student_number: d.studentNumber, at: d.at?.toISOString() });
  }
}

export class PbFeedPostRepository extends PbRepository<FeedPost> implements FeedPostRepository {
  constructor(pb: PocketBase) {
    super(pb, 'feed_posts');
  }

  async listBySession(sessionId: string) {
    const list = await this.col.getFullList({ filter: this.pb.filter('session = {:s}', { s: sessionId }), sort: 'posted_at' });
    return list.map((r) => this.toEntity(r));
  }

  private readonly voteLock = new KeyedLock();

  /** PB's "votes+" is read-modify-write in Go, not atomic SQL: concurrent upvotes lost increments in testing. */
  async incrementVotes(id: string) {
    await this.voteLock.run(id, () => this.col.update(id, { 'votes+': 1 }));
  }

  protected toEntity(r: RecordModel): FeedPost {
    return {
      id: r.id,
      sessionId: r.session,
      authorId: r.author || undefined,
      authorNumber: r.author_number,
      displayName: r.anonymous ? null : r.display_name,
      anonymous: r.anonymous,
      text: r.text,
      votes: r.votes,
      answered: r.answered,
      postedAt: toDate(r.posted_at)!,
    };
  }

  protected toRecord(d: Partial<Omit<FeedPost, 'id'>>) {
    return compact({
      session: d.sessionId,
      author: d.authorId,
      author_number: d.authorNumber,
      display_name: d.displayName === null ? '' : d.displayName,
      anonymous: d.anonymous,
      text: d.text,
      votes: d.votes,
      answered: d.answered,
      posted_at: d.postedAt?.toISOString(),
    });
  }
}

export class PbPostVoteRepository extends PbRepository<PostVote> implements PostVoteRepository {
  constructor(pb: PocketBase) {
    super(pb, 'post_votes');
  }

  async exists(postId: string, voterNumber: string) {
    return (await this.first('post = {:p} && voter_number = {:n}', { p: postId, n: voterNumber })) !== null;
  }

  protected toEntity(r: RecordModel): PostVote {
    return { id: r.id, postId: r.post, voterId: r.voter || undefined, voterNumber: r.voter_number };
  }

  protected toRecord(d: Partial<Omit<PostVote, 'id'>>) {
    return compact({ post: d.postId, voter: d.voterId, voter_number: d.voterNumber });
  }
}

export class PbPollRepository extends PbRepository<Poll> implements PollRepository {
  constructor(pb: PocketBase) {
    super(pb, 'polls');
  }

  findOpenBySession(sessionId: string) {
    return this.first("session = {:s} && status = 'open'", { s: sessionId });
  }

  protected toEntity(r: RecordModel): Poll {
    return {
      id: r.id,
      sessionId: r.session,
      question: r.question,
      options: r.options as string[],
      correctIndex: r.correct_index >= 0 ? r.correct_index : null,
      status: r.status,
      source: r.source,
      results: (r.results as PollResults | null) || null,
      createdAt: toDate(r.created_at)!,
      openedAt: toDate(r.opened_at),
      closedAt: toDate(r.closed_at),
    };
  }

  /** PB number fields default to 0, so "no correct answer" / "not revealed" are stored as -1. */
  protected toRecord(d: Partial<Omit<Poll, 'id'>>) {
    return compact({
      session: d.sessionId,
      question: d.question,
      options: d.options,
      correct_index: 'correctIndex' in d ? (d.correctIndex ?? -1) : undefined,
      // Revealed to clients only once results exist (i.e. on close).
      answer_index: d.results ? (d.results.correctIndex ?? -1) : d.status === 'draft' ? -1 : undefined,
      status: d.status,
      source: d.source,
      results: d.results ?? undefined,
      created_at: d.createdAt?.toISOString(),
      opened_at: d.openedAt?.toISOString(),
      closed_at: d.closedAt?.toISOString(),
    });
  }
}

export class PbPollVoteRepository extends PbRepository<PollVote> implements PollVoteRepository {
  constructor(pb: PocketBase) {
    super(pb, 'poll_votes');
  }

  async exists(pollId: string, studentNumber: string) {
    return (await this.first('poll = {:p} && student_number = {:n}', { p: pollId, n: studentNumber })) !== null;
  }

  async listByPoll(pollId: string) {
    const list = await this.col.getFullList({ filter: this.pb.filter('poll = {:p}', { p: pollId }) });
    return list.map((r) => this.toEntity(r));
  }

  protected toEntity(r: RecordModel): PollVote {
    return { id: r.id, pollId: r.poll, studentId: r.student || undefined, studentNumber: r.student_number, optionIndex: r.option_index };
  }

  protected toRecord(d: Partial<Omit<PollVote, 'id'>>) {
    return compact({ poll: d.pollId, student: d.studentId, student_number: d.studentNumber, option_index: d.optionIndex });
  }
}
