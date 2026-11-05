import { appendFile, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KeyedLock } from './KeyedLock.js';

/**
 * Chunked uploads to a temp file. Cloudflare caps a request at 100 MB, so a lecture recording arrives in pieces.
 * Each chunk states its byte offset: a retried chunk that already landed is ignored, a gap is rejected.
 */
export class UploadStore {
  private readonly lock = new KeyedLock();

  constructor(private readonly dir = join(tmpdir(), 'classpulse-uploads')) {}

  path(id: string): string {
    if (!/^[\w-]+$/.test(id)) throw new Error('Bad upload id');
    return join(this.dir, id);
  }

  async size(id: string): Promise<number> {
    try {
      return (await stat(this.path(id))).size;
    } catch {
      return 0;
    }
  }

  /** Returns the file size after the call, or null if `offset` leaves a gap. */
  append(id: string, offset: number, data: Buffer): Promise<number | null> {
    return this.lock.run(id, () => this.appendNow(id, offset, data));
  }

  private async appendNow(id: string, offset: number, data: Buffer): Promise<number | null> {
    const current = await this.size(id);
    if (offset + data.length <= current) return current; // duplicate retry of a chunk we already have
    if (offset !== current) return null;
    await mkdir(this.dir, { recursive: true });
    await appendFile(this.path(id), data);
    return current + data.length;
  }

  async remove(id: string): Promise<void> {
    await rm(this.path(id), { force: true });
  }
}
