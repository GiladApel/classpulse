export interface Entity {
  id: string;
}

export interface Repository<T extends Entity> {
  get(id: string): Promise<T | null>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T>;
}
