import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { AttendanceRecord } from '../../attendance/types.js';
import { CsvExporter } from './CsvExporter.js';
import { HEADERS } from './SpreadsheetExporter.js';
import { XlsxExporter } from './XlsxExporter.js';

const meta = { title: 'הרצאה 5', courseName: 'הנדסת תוכנה', startedAt: new Date('2026-11-05T08:00:00Z') };
const rec = (n: string, name: string, time: string, over: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: n,
  sessionId: 's',
  studentNumber: n,
  studentName: name,
  deviceId: 'd',
  checkedInAt: new Date(time),
  method: 'qr',
  distanceM: 12,
  geoFlag: false,
  status: 'present',
  note: '',
  ...over,
});
// Deliberately out of order: export must sort by arrival time.
const records = [
  rec('222', 'בני, "הגדול"', '2026-11-05T08:05:00Z', { method: 'manual', distanceM: undefined, note: 'טלפון מת' }),
  rec('111', 'דנה כהן', '2026-11-05T08:01:30Z', { geoFlag: true, distanceM: 300 }),
];

describe('CsvExporter', () => {
  it('writes BOM, Hebrew headers, sorted rows and escapes quotes/commas', async () => {
    const out = await new CsvExporter().export(records, meta);
    if (out.kind !== 'file') throw new Error('expected file');
    expect(out.filename).toBe('2026-11-05 הנדסת תוכנה הרצאה 5.csv');
    const text = out.data.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe(HEADERS.join(','));
    expect(lines[1]).toBe('111,דנה כהן,10:01:30,QR,נוכח,300,כן,');
    expect(lines[2]).toBe('222,"בני, ""הגדול""",10:05:00,ידני,נוכח,,,טלפון מת');
  });
});

describe('XlsxExporter', () => {
  it('produces an RTL workbook whose rows round-trip', async () => {
    const out = await new XlsxExporter().export(records, meta);
    if (out.kind !== 'file') throw new Error('expected file');
    expect(out.filename.endsWith('.xlsx')).toBe(true);
    const book = XLSX.read(out.data, { type: 'buffer' });
    expect(book.Workbook?.Views?.[0]?.RTL).toBe(true);
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets['נוכחות'], { header: 1 });
    expect(rows[0]).toEqual(HEADERS);
    expect(rows.slice(1).map((r) => r[0])).toEqual(['111', '222']);
  });
});
