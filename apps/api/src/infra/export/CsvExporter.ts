import type { AttendanceRecord } from '../../attendance/types.js';
import { baseFilename, type ExportOutput, HEADERS, type SessionMeta, type SpreadsheetExporter, toRows } from './SpreadsheetExporter.js';

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export class CsvExporter implements SpreadsheetExporter {
  async export(records: AttendanceRecord[], meta: SessionMeta): Promise<ExportOutput> {
    const lines = [HEADERS, ...toRows(records)].map((row) => row.map(cell).join(','));
    // BOM so Excel opens Hebrew correctly.
    const data = Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
    return { kind: 'file', filename: `${baseFilename(meta)}.csv`, contentType: 'text/csv; charset=utf-8', data };
  }
}
