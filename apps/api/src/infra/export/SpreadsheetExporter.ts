import type { AttendanceRecord } from '../../attendance/types.js';

export type ExportFormat = 'xlsx' | 'csv' | 'sheets';

export interface SessionMeta {
  title: string;
  courseName: string;
  startedAt: Date;
}

export type ExportOutput =
  | { kind: 'file'; filename: string; contentType: string; data: Buffer }
  | { kind: 'link'; url: string };

export interface SpreadsheetExporter {
  export(records: AttendanceRecord[], meta: SessionMeta): Promise<ExportOutput>;
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

export function baseFilename(meta: SessionMeta): string {
  const safe = `${meta.courseName} ${meta.title}`.replace(/[\\/:*?"<>|]+/g, '').trim();
  return `${date.format(meta.startedAt)} ${safe}`;
}
