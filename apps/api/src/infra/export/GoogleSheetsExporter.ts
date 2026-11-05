import { readFileSync } from 'node:fs';
import { auth, sheets, type sheets_v4 } from '@googleapis/sheets';
import type { AttendanceRecord } from '../../attendance/types.js';
import { baseFilename, type ExportOutput, HEADERS, type SessionMeta, type SpreadsheetExporter, toRows } from './SpreadsheetExporter.js';

/** Writes each session to its own tab (re-export overwrites it) in one spreadsheet shared with the service account. */
export class GoogleSheetsExporter implements SpreadsheetExporter {
  private readonly client: sheets_v4.Sheets;

  constructor(
    keyFile: string,
    private readonly spreadsheetId: string,
  ) {
    const key = JSON.parse(readFileSync(keyFile, 'utf8')) as { client_email: string; private_key: string };
    const jwt = new auth.JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    this.client = sheets({ version: 'v4', auth: jwt });
  }

  async export(records: AttendanceRecord[], meta: SessionMeta): Promise<ExportOutput> {
    const title = baseFilename(meta).slice(0, 90);
    const sheetId = await this.ensureTab(title);
    await this.client.spreadsheets.values.clear({ spreadsheetId: this.spreadsheetId, range: `'${title}'` });
    await this.client.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `'${title}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS, ...toRows(records)] },
    });
    return { kind: 'link', url: `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit#gid=${sheetId}` };
  }

  private async ensureTab(title: string): Promise<number> {
    const { data } = await this.client.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: 'sheets.properties' });
    const found = data.sheets?.find((s) => s.properties?.title === title)?.properties?.sheetId;
    if (found != null) return found;
    const res = await this.client.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title, rightToLeft: true } } }] },
    });
    return res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  }
}
