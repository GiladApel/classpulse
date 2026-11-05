import * as XLSX from 'xlsx';
import type { AttendanceRecord } from '../../attendance/types.js';
import { baseFilename, type ExportOutput, HEADERS, type SessionMeta, type SpreadsheetExporter, toRows } from './SpreadsheetExporter.js';

export class XlsxExporter implements SpreadsheetExporter {
  async export(records: AttendanceRecord[], meta: SessionMeta): Promise<ExportOutput> {
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...toRows(records)]);
    sheet['!cols'] = [12, 22, 10, 8, 8, 10, 10, 30].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'נוכחות');
    book.Workbook = { Views: [{ RTL: true }] };
    const data = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      kind: 'file',
      filename: `${baseFilename(meta)}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data,
    };
  }
}
