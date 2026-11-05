import { ClientResponseError, type RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { ChallengeRepository, ChallengeResponseRepository, HeadcountRepository } from '../../challenge/repositories.js';
import type { Box, ChallengeData, ChallengeResponse, Headcount, Verdict } from '../../challenge/types.js';
import { compact, PbRepository, toDate } from './PbRepository.js';

const jpeg = (data: Buffer, name: string) => new File([new Uint8Array(data)], name, { type: 'image/jpeg' });

async function orNull<T>(fetch: () => Promise<T>): Promise<T | null> {
  try {
    return await fetch();
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 404) return null;
    throw e;
  }
}

export class PbHeadcountRepository implements HeadcountRepository {
  constructor(private readonly pb: PocketBase) {}

  private get col() {
    return this.pb.collection('headcounts');
  }

  async create(d: Omit<Headcount, 'id'>, files: { photo: Buffer; blurred: Buffer }): Promise<Headcount> {
    const rec = await this.col.create({
      session: d.sessionId,
      people_count: d.peopleCount ?? -1,
      confidence: d.confidence,
      boxes: d.boxes,
      checkins_at_snap: d.checkinsAtSnap,
      photo: jpeg(files.photo, 'photo.jpg'),
      blurred_photo: jpeg(files.blurred, 'blurred.jpg'),
    });
    return this.toEntity(rec);
  }

  async get(id: string): Promise<Headcount | null> {
    const rec = await orNull(() => this.col.getOne(id));
    return rec && this.toEntity(rec);
  }

  async getBlurred(id: string): Promise<Buffer> {
    const rec = await this.col.getOne(id);
    const url = this.pb.files.getURL(rec, rec.blurred_photo, { token: await this.pb.files.getToken() });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Blurred photo download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async purgeClearPhotos(sessionId: string): Promise<void> {
    const list = await this.col.getFullList({ filter: this.pb.filter("session = {:s} && photo != ''", { s: sessionId }) });
    for (const rec of list) await this.col.update(rec.id, { photo: null });
  }

  private toEntity(r: RecordModel): Headcount {
    return {
      id: r.id,
      sessionId: r.session,
      peopleCount: r.people_count < 0 ? null : r.people_count,
      confidence: r.confidence,
      boxes: (r.boxes ?? []) as Box[],
      checkinsAtSnap: r.checkins_at_snap,
      createdAt: toDate(r.created)!,
    };
  }
}

export class PbChallengeRepository extends PbRepository<ChallengeData> implements ChallengeRepository {
  constructor(pb: PocketBase) {
    super(pb, 'challenges');
  }

  async create(data: Omit<ChallengeData, 'id'>, image?: Buffer): Promise<ChallengeData> {
    const body = this.toRecord(data);
    if (image) body.image = jpeg(image, 'challenge.jpg');
    return this.toEntity(await this.col.create(body));
  }

  findActiveBySession(sessionId: string) {
    return this.first("session = {:s} && status = 'active'", { s: sessionId });
  }

  async listActiveExpired(now: Date) {
    const list = await this.col.getFullList({ filter: this.pb.filter("status = 'active' && expires_at <= {:now}", { now }) });
    return list.map((r) => this.toEntity(r));
  }

  protected toEntity(r: RecordModel): ChallengeData {
    return {
      id: r.id,
      sessionId: r.session,
      headcountId: r.headcount || undefined,
      type: r.type,
      status: r.status,
      startedAt: toDate(r.started_at)!,
      expiresAt: toDate(r.expires_at)!,
      secret: r.secret,
    };
  }

  protected toRecord(d: Partial<Omit<ChallengeData, 'id'>>): Record<string, unknown> {
    return compact({
      session: d.sessionId,
      headcount: d.headcountId,
      type: d.type,
      status: d.status,
      started_at: d.startedAt?.toISOString(),
      expires_at: d.expiresAt?.toISOString(),
      secret: d.secret,
    });
  }
}

export class PbChallengeResponseRepository extends PbRepository<ChallengeResponse> implements ChallengeResponseRepository {
  constructor(pb: PocketBase) {
    super(pb, 'challenge_responses');
  }

  /** Always write x/y: PB number fields default to 0, which would read back as a tap in the corner. */
  async create(data: Omit<ChallengeResponse, 'id'>): Promise<ChallengeResponse> {
    return super.create({ ...data, tap: data.tap });
  }

  findByChallengeAndStudent(challengeId: string, studentNumber: string) {
    return this.first('challenge = {:c} && student_number = {:n}', { c: challengeId, n: studentNumber });
  }

  async listByChallenge(challengeId: string) {
    const list = await this.col.getFullList({ filter: this.pb.filter('challenge = {:c}', { c: challengeId }) });
    return list.map((r) => this.toEntity(r));
  }

  async setVerdict(id: string, verdict: Verdict) {
    await this.col.update(id, { verdict });
  }

  protected toEntity(r: RecordModel): ChallengeResponse {
    return {
      id: r.id,
      challengeId: r.challenge,
      studentId: r.student || undefined,
      studentNumber: r.student_number,
      // PB number fields can't be null; -1 means "no tap".
      tap: r.x >= 0 && r.y >= 0 ? { x: r.x, y: r.y } : undefined,
      respondedAt: toDate(r.responded_at)!,
      verdict: r.verdict,
    };
  }

  protected toRecord(d: Partial<Omit<ChallengeResponse, 'id'>>): Record<string, unknown> {
    return compact({
      challenge: d.challengeId,
      student: d.studentId,
      student_number: d.studentNumber,
      x: 'tap' in d ? (d.tap?.x ?? -1) : undefined,
      y: 'tap' in d ? (d.tap?.y ?? -1) : undefined,
      responded_at: d.respondedAt?.toISOString(),
      verdict: d.verdict,
    });
  }
}
