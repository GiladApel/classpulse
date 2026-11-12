import * as XLSX from 'xlsx';

export interface RosterRow {
  studentNumber: string;
  name: string;
}

export interface SkippedRow {
  /** 1-based, as the lecturer sees it in the file. */
  line: number;
  text: string;
  reason: 'NO_ID' | 'DUPLICATE';
}

export interface RosterParseResult {
  rows: RosterRow[];
  skipped: SkippedRow[];
}

// Student IDs are 9 digits (onboarding enforces it). Excel stores them as numbers and drops leading zeros,
// so 5-8 digit cells are padded back to 9.
const ID_CELL = /^\d{5,9}$/;
const MAX_NAME = 80;

// .xlsx is a zip ("PK"), legacy .xls an OLE file. Anything else is text.
const isSpreadsheet = (b: Buffer) =>
  (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0);

/** Excel's "CSV UTF-8" is UTF-8; its plain "CSV" on a Hebrew Windows is Windows-1255. */
function decodeText(b: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1255').decode(b);
  }
}

/** Reads a course roster from a pasted list, CSV/TSV or an Excel sheet: one student per row, ID and name in any order. */
export class RosterParser {
  fromText(text: string): RosterParseResult {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    return this.fromRows(lines.map((line) => this.cells(line)));
  }

  /** The first sheet of an .xlsx/.xls file, or a CSV/text file. */
  fromFile(data: Buffer): RosterParseResult {
    if (!isSpreadsheet(data)) return this.fromText(decodeText(data));
    const book = XLSX.read(data, { type: 'buffer', raw: false });
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) return { rows: [], skipped: [] };
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: '' });
    return this.fromRows(rows.map((r) => r.map((c) => String(c ?? '').trim())));
  }

  fromRows(rows: string[][]): RosterParseResult {
    const result: RosterParseResult = { rows: [], skipped: [] };
    const seen = new Set<string>();
    rows.forEach((cells, i) => {
      const filled = cells.map((c) => c.trim()).filter(Boolean);
      if (filled.length === 0) return;
      const idCell = filled.find((c) => ID_CELL.test(c));
      if (!idCell) {
        // A header row ("ת.ז., שם") is expected and not worth reporting.
        if (i > 0 || filled.some((c) => /\d/.test(c))) result.skipped.push({ line: i + 1, text: filled.join(' '), reason: 'NO_ID' });
        return;
      }
      const studentNumber = idCell.padStart(9, '0');
      if (seen.has(studentNumber)) {
        result.skipped.push({ line: i + 1, text: filled.join(' '), reason: 'DUPLICATE' });
        return;
      }
      seen.add(studentNumber);
      const name = filled
        .filter((c) => c !== idCell && !/^\d+$/.test(c) && !c.includes('@'))
        .join(' ')
        .slice(0, MAX_NAME);
      result.rows.push({ studentNumber, name });
    });
    return result;
  }

  /** Splits a pasted or CSV line on tab, comma or semicolon; a line with none of them is "ID name" or "name ID". */
  private cells(line: string): string[] {
    // A quoted CSV field with a comma inside ("Cohen, Dana") splits in two; both halves stay in the name.
    const unquoted = (c: string) => c.replace(/"/g, '').trim();
    if (/[\t,;]/.test(line)) return line.split(/[\t,;]/).map(unquoted);
    const m = /^\s*(\d{5,9})\s+(.+)$/.exec(line) ?? /^(.+?)\s+(\d{5,9})\s*$/.exec(line);
    if (!m) return [line.trim()];
    return [m[1].trim(), m[2].trim()];
  }
}
