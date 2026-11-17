import * as XLSX from 'xlsx';
import { baseFilename, type ExportOutput, type SessionMeta, type SpreadsheetExporter, type Table } from './SpreadsheetExporter.js';

export class XlsxExporter implements SpreadsheetExporter {
  async export(table: Table, meta: SessionMeta): Promise<ExportOutput> {
    const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
    if (table.widths) sheet['!cols'] = table.widths.map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, table.name);
    book.Workbook = { Views: [{ RTL: true }] };
    const data = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      kind: 'file',
      filename: `${baseFilename(meta, table)}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data,
    };
  }
}
