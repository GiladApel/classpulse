import type { AttendanceRecord } from '../../attendance/types.js';

export type ExportFormat = 'xlsx' | 'csv' | 'sheets';

export interface SessionMeta {
  title: string;
  courseName: string;
  startedAt: Date;
}

/** One sheet: the attendance list, a lecture's comments, … */
export interface Table {
  /** Sheet name, and a suffix for the file name when `suffix` is set. */
  name: string;
  suffix?: string;
  headers: string[];
  rows: (string | number)[][];
  /** Column widths in characters (xlsx only). */
  widths?: number[];
}

export type ExportOutput =
  | { kind: 'file'; filename: string; contentType: string; data: Buffer }
  | { kind: 'link'; url: string };

export interface SpreadsheetExporter {
  export(table: Table, meta: SessionMeta): Promise<ExportOutput>;
}

const TZ = 'Asia/Jerusalem';
const time = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

export const HEADERS = ['מס׳ סטודנט', 'שם', 'שעת הגעה', 'אופן', 'סטטוס', 'מרחק (מ׳)', 'חריגת מיקום', 'הערה'];

const METHOD = { qr: 'QR', manual: 'ידני' } as const;
const STATUS = { present: 'נוכח', flagged: 'לבדיקה', removed: 'הוסר' } as const;

export function toRows(records: AttendanceRecord[]): (string | number)[][] {
  return [...records]
    .sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime())
    .map((r) => [
      r.studentNumber,
      r.studentName,
      time.format(r.checkedInAt),
      METHOD[r.method],
      STATUS[r.status],
      r.distanceM ?? '',
      r.geoFlag ? 'כן' : '',
      r.note,
    ]);
}

export function attendanceTable(records: AttendanceRecord[]): Table {
  return { name: 'נוכחות', headers: HEADERS, rows: toRows(records), widths: [12, 22, 10, 8, 8, 10, 10, 30] };
}

export function baseFilename(meta: SessionMeta, table?: Pick<Table, 'suffix'>): string {
  const safe = `${meta.courseName} ${meta.title}`.replace(/[\\/:*?"<>|]+/g, '').trim();
  return `${date.format(meta.startedAt)} ${safe}${table?.suffix ? ` ${table.suffix}` : ''}`;
}
