import { baseFilename, type ExportOutput, type SessionMeta, type SpreadsheetExporter, type Table } from './SpreadsheetExporter.js';

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export class CsvExporter implements SpreadsheetExporter {
  async export(table: Table, meta: SessionMeta): Promise<ExportOutput> {
    const lines = [table.headers, ...table.rows].map((row) => row.map(cell).join(','));
    // BOM so Excel opens Hebrew correctly.
    const data = Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
    return { kind: 'file', filename: `${baseFilename(meta, table)}.csv`, contentType: 'text/csv; charset=utf-8', data };
  }
}
