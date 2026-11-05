import type { Session } from '../attendance/types.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError, NotFoundError } from '../shared/errors.js';
import type { FileInput, MaterialRepository } from './repositories.js';
import type { Material } from './types.js';

export const MAX_MATERIAL_BYTES = 50 * 1024 * 1024;

/** Files and links the lecturer attaches to a lecture page (FR-LP-03), during or after the lecture. */
export class MaterialService {
  constructor(
    private readonly materials: MaterialRepository,
    private readonly clock: Clock,
  ) {}

  async addLink(session: Session, title: string, url: string): Promise<Material> {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new DomainError('INVALID_LINK', 'הקישור לא תקין');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new DomainError('INVALID_LINK', 'הקישור לא תקין');
    return this.materials.create({
      sessionId: session.id,
      title: title.trim() || parsed.hostname,
      kind: 'link',
      url: parsed.href,
      filename: '',
      addedAt: this.clock.now(),
    });
  }

  async addFile(session: Session, title: string, file: FileInput): Promise<Material> {
    if (file.data.length === 0) throw new DomainError('EMPTY_FILE', 'הקובץ ריק');
    if (file.data.length > MAX_MATERIAL_BYTES) throw new DomainError('FILE_TOO_LARGE', 'הקובץ גדול מ-50MB');
    return this.materials.createWithFile(
      { sessionId: session.id, title: title.trim() || file.filename, kind: 'file', url: '', filename: file.filename, addedAt: this.clock.now() },
      file,
    );
  }

  async remove(materialId: string): Promise<void> {
    await this.get(materialId);
    await this.materials.delete(materialId);
  }

  async get(materialId: string): Promise<Material> {
    const m = await this.materials.get(materialId);
    if (!m) throw new NotFoundError('Material');
    return m;
  }
}
