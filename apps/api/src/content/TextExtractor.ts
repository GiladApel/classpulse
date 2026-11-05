import { extractText } from 'unpdf';
import { DomainError } from '../shared/errors.js';
import type { TextKind } from './Fingerprinter.js';

export interface UploadedFile {
  data: Buffer;
  filename: string;
  mimeType: string;
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'java', 'py', 'ts', 'tsx', 'js', 'jsx', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'kt', 'swift', 'sql', 'html', 'css', 'json', 'xml', 'yml', 'yaml', 'sh',
]);

export class TextExtractor {
  static readonly accept = ['.pdf', ...[...TEXT_EXTENSIONS].map((e) => `.${e}`)];

  async extract(file: UploadedFile): Promise<{ text: string; kind: TextKind }> {
    const ext = file.filename.toLowerCase().split('.').pop() ?? '';
    let text: string;
    let kind: TextKind = 'prose';
    if (ext === 'pdf' || file.mimeType === 'application/pdf') {
      try {
        text = (await extractText(new Uint8Array(file.data), { mergePages: true })).text;
      } catch {
        throw new DomainError('UNREADABLE_FILE', 'לא הצלחנו לקרוא את קובץ ה-PDF');
      }
    } else if (TEXT_EXTENSIONS.has(ext)) {
      text = file.data.toString('utf8');
      if (ext !== 'txt' && ext !== 'md') kind = 'code';
    } else {
      throw new DomainError('UNSUPPORTED_FILE', 'אפשר להגיש PDF או קובץ טקסט/קוד');
    }
    text = text.replace(/\u0000/g, '').trim();
    // A scanned PDF has no text layer; reviewing an empty string would produce a meaningless grade.
    if (text.length < 20) throw new DomainError('EMPTY_FILE', 'לא נמצא טקסט בקובץ (PDF סרוק?) — הגישו PDF עם טקסט');
    return { text, kind };
  }
}
