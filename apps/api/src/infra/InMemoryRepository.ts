import { NotFoundError } from '../shared/errors.js';
import type { Entity, Repository } from './Repository.js';

export class InMemoryRepository<T extends Entity> implements Repository<T> {
  protected items = new Map<string, T>();
  private seq = 0;

  async get(id: string): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    const item = { ...data, id: `mem${++this.seq}` } as T;
    this.items.set(item.id, item);
    return item;
  }

  async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
    const current = this.items.get(id);
    if (!current) throw new NotFoundError(id);
    const next = { ...current, ...data };
    this.items.set(id, next);
    return next;
  }

  protected all(): T[] {
    return [...this.items.values()];
  }
}
