import { ClientResponseError, type RecordModel, type RecordService } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { Entity, Repository } from '../Repository.js';

export abstract class PbRepository<T extends Entity> implements Repository<T> {
  protected readonly col: RecordService;

  constructor(
    protected readonly pb: PocketBase,
    collection: string,
    protected readonly expand?: string,
  ) {
    this.col = pb.collection(collection);
  }

  protected abstract toEntity(rec: RecordModel): T;
  protected abstract toRecord(data: Partial<Omit<T, 'id'>>): Record<string, unknown>;

  async get(id: string): Promise<T | null> {
    return this.orNull(() => this.col.getOne(id, { expand: this.expand }));
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    return this.toEntity(await this.col.create(this.toRecord(data as Partial<Omit<T, 'id'>>), { expand: this.expand }));
  }

  async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
    return this.toEntity(await this.col.update(id, this.toRecord(data), { expand: this.expand }));
  }

  protected async first(filter: string, params: Record<string, unknown>): Promise<T | null> {
    return this.orNull(() => this.col.getFirstListItem(this.pb.filter(filter, params), { expand: this.expand }));
  }

  private async orNull(fetch: () => Promise<RecordModel>): Promise<T | null> {
    try {
      return this.toEntity(await fetch());
    } catch (e) {
      if (e instanceof ClientResponseError && e.status === 404) return null;
      throw e;
    }
  }
}

export const toDate = (v: unknown): Date | undefined => (typeof v === 'string' && v ? new Date(v) : undefined);

/** Drops undefined keys so partial updates don't blank fields. */
export const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
