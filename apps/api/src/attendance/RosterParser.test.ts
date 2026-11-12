import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { RosterParser } from './RosterParser.js';

const parser = new RosterParser();

describe('RosterParser', () => {
  it('reads a pasted list with the ID first or last, and skips the header and empty lines', () => {
    const text = 'ת.ז. שם\n123456789 דנה כהן\n\nאבי לוי 222222222\n';
    expect(parser.fromText(text)).toEqual({
      rows: [
        { studentNumber: '123456789', name: 'דנה כהן' },
        { studentNumber: '222222222', name: 'אבי לוי' },
      ],
      skipped: [],
    });
  });

  it('reads CSV and TSV with quotes, a BOM and an email column, in any column order', () => {
    const csv = '﻿שם,ת.ז.,מייל\r\n"כהן, דנה",123456789,dana@post.ariel.ac.il\r\n';
    expect(parser.fromText(csv).rows).toEqual([{ studentNumber: '123456789', name: 'כהן דנה' }]);
    expect(parser.fromText('333333333\tרינה\n').rows).toEqual([{ studentNumber: '333333333', name: 'רינה' }]);
  });

  it('pads IDs that lost their leading zeros back to 9 digits', () => {
    expect(parser.fromText('12345678 אורי').rows[0].studentNumber).toBe('012345678');
  });

  it('reports duplicates and rows without an ID by their line number', () => {
    const r = parser.fromText('123456789 דנה\n123456789 דנה שוב\nשורה בלי מספר\n12 קצר מדי');
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toEqual([
      { line: 2, text: '123456789 דנה שוב', reason: 'DUPLICATE' },
      { line: 3, text: 'שורה בלי מספר', reason: 'NO_ID' },
      { line: 4, text: '12 קצר מדי', reason: 'NO_ID' },
    ]);
  });

  it('reads the first sheet of an Excel file, including IDs stored as numbers', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['מספר', 'שם מלא'],
      [12345678, 'אורי'],
      ['222222222', 'אבי לוי'],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Roster');
    const data = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    expect(parser.fromFile(data)).toEqual({
      rows: [
        { studentNumber: '012345678', name: 'אורי' },
        { studentNumber: '222222222', name: 'אבי לוי' },
      ],
      skipped: [],
    });
  });
});
