import type { GeoPoint } from '../attendance/types.js';
import { ValidationError } from './errors.js';

type Body = Record<string, unknown>;

export function str(body: Body, key: string, opts: { max?: number; optional?: boolean } = {}): string {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return '';
    throw new ValidationError(`${key} is required`);
  }
  if (typeof v !== 'string') throw new ValidationError(`${key} must be a string`);
  const s = v.trim();
  if (opts.max && s.length > opts.max) throw new ValidationError(`${key} is too long`);
  return s;
}

export function num(body: Body, key: string, min: number, max: number): number {
  const v = body[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new ValidationError(`${key} must be a number in [${min}, ${max}]`);
  }
  return v;
}

export function oneOf<T extends string>(body: Body, key: string, values: readonly T[]): T {
  const v = body[key];
  if (!values.includes(v as T)) throw new ValidationError(`${key} must be one of ${values.join(', ')}`);
  return v as T;
}

export function geo(body: Body, key: string): GeoPoint | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object') throw new ValidationError(`${key} must be an object`);
  const p = v as Body;
  return {
    lat: num(p, 'lat', -90, 90),
    lng: num(p, 'lng', -180, 180),
    accuracyM: p.accuracyM === undefined ? undefined : num(p, 'accuracyM', 0, 100_000),
  };
}

export async function jsonBody(req: { json(): Promise<unknown> }): Promise<Body> {
  try {
    const b = await req.json();
    if (b && typeof b === 'object') return b as Body;
  } catch {
    /* fall through */
  }
  throw new ValidationError('JSON body required');
}
