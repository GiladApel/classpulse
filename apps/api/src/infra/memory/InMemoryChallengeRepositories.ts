import type { ChallengeRepository, ChallengeResponseRepository, HeadcountRepository } from '../../challenge/repositories.js';
import type { ChallengeData, ChallengeResponse, Headcount, Verdict } from '../../challenge/types.js';
import { NotFoundError } from '../../shared/errors.js';
import { InMemoryRepository } from '../InMemoryRepository.js';

export class InMemoryHeadcountRepository implements HeadcountRepository {
  readonly items = new Map<string, Headcount & { photo: Buffer | null; blurred: Buffer }>();
  private seq = 0;

  async create(data: Omit<Headcount, 'id'>, files: { photo: Buffer; blurred: Buffer }): Promise<Headcount> {
    const item = { ...data, id: `hc${++this.seq}`, ...files };
    this.items.set(item.id, item);
    const { photo: _p, blurred: _b, ...headcount } = item;
    return headcount;
  }

  async get(id: string): Promise<Headcount | null> {
    const item = this.items.get(id);
    if (!item) return null;
    const { photo: _p, blurred: _b, ...headcount } = item;
    return headcount;
  }

  async getBlurred(id: string): Promise<Buffer> {
    const item = this.items.get(id);
    if (!item) throw new NotFoundError('Headcount');
    return item.blurred;
  }

  async purgeClearPhotos(sessionId: string): Promise<void> {
    for (const item of this.items.values()) if (item.sessionId === sessionId) item.photo = null;
  }
}

export class InMemoryChallengeRepository extends InMemoryRepository<ChallengeData> implements ChallengeRepository {
  readonly images = new Map<string, Buffer>();

  async create(data: Omit<ChallengeData, 'id'>, image?: Buffer): Promise<ChallengeData> {
    const created = await super.create(data);
    if (image) this.images.set(created.id, image);
    return created;
  }

  async findActiveBySession(sessionId: string) {
    return this.all().find((c) => c.sessionId === sessionId && c.status === 'active') ?? null;
  }

  async listActiveExpired(now: Date) {
    return this.all().filter((c) => c.status === 'active' && c.expiresAt.getTime() <= now.getTime());
  }
}

export class InMemoryChallengeResponseRepository extends InMemoryRepository<ChallengeResponse> implements ChallengeResponseRepository {
  async create(data: Omit<ChallengeResponse, 'id'>): Promise<ChallengeResponse> {
    // Mirrors the unique index (challenge, student_number); synchronous so it is atomic.
    if (this.all().some((r) => r.challengeId === data.challengeId && r.studentNumber === data.studentNumber)) {
      throw new Error('UNIQUE constraint');
    }
    return super.create(data);
  }

  async findByChallengeAndStudent(challengeId: string, studentNumber: string) {
    return this.all().find((r) => r.challengeId === challengeId && r.studentNumber === studentNumber) ?? null;
  }

  async listByChallenge(challengeId: string) {
    return this.all().filter((r) => r.challengeId === challengeId);
  }

  async setVerdict(id: string, verdict: Verdict) {
    await this.update(id, { verdict });
  }
}
