import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { RosterParser } from './RosterParser.js';

const parser = new RosterParser();
const row = (email: string, studentNumber: string, name: string) => ({ email, studentNumber, name });

describe('RosterParser', () => {
  it('reads a pasted list of emails and names, lowercasing the emails and skipping the header', () => {
    const text = 'מייל שם\nDana.Cohen@Post.Ariel.ac.il דנה כהן\n\nאבי לוי avi@gmail.com\n';
    expect(parser.fromText(text)).toEqual({
      rows: [row('dana.cohen@post.ariel.ac.il', '', 'דנה כהן'), row('avi@gmail.com', '', 'אבי לוי')],
      skipped: [],
    });
  });

  it('still reads a list of IDs, with the ID first or last', () => {
    expect(parser.fromText('ת.ז. שם\n123456789 דנה כהן\nאבי לוי 222222222\n').rows).toEqual([
      row('', '123456789', 'דנה כהן'),
      row('', '222222222', 'אבי לוי'),
    ]);
  });

  it('reads CSV and TSV with quotes, a BOM and both an email and an ID, in any column order', () => {
    const csv = '﻿שם,ת.ז.,מייל\r\n"כהן, דנה",123456789,dana@post.ariel.ac.il\r\n';
    expect(parser.fromText(csv).rows).toEqual([row('dana@post.ariel.ac.il', '123456789', 'כהן דנה')]);
    expect(parser.fromText('rina@gmail.com\tרינה\n').rows).toEqual([row('rina@gmail.com', '', 'רינה')]);
  });

  it('pads IDs that lost their leading zeros back to 9 digits', () => {
    expect(parser.fromText('12345678 אורי').rows[0].studentNumber).toBe('012345678');
  });

  it('reports duplicates (same email in any case, or same ID), bad emails and rows with neither, by line number', () => {
    const r = parser.fromText('dana@x.com דנה\nDANA@x.com דנה שוב\n123456789 אבי\nb@y.com 123456789 אבי שוב\nשורה בלי כלום\n12 קצר מדי\ndana@ שבור');
    expect(r.rows).toEqual([row('dana@x.com', '', 'דנה'), row('', '123456789', 'אבי')]);
    expect(r.skipped).toEqual([
      { line: 2, text: 'DANA@x.com דנה שוב', reason: 'DUPLICATE' },
      { line: 4, text: 'b@y.com 123456789 אבי שוב', reason: 'DUPLICATE' },
      { line: 5, text: 'שורה בלי כלום', reason: 'NO_EMAIL_OR_ID' },
      { line: 6, text: '12 קצר מדי', reason: 'NO_EMAIL_OR_ID' },
      { line: 7, text: 'dana@ שבור', reason: 'BAD_EMAIL' },
    ]);
  });

  it('reads a CSV file saved as UTF-8 or as Hebrew Windows-1255 without garbling the names', () => {
    expect(parser.fromFile(Buffer.from('מייל,שם\ndana@x.com,דנה\n')).rows).toEqual([row('dana@x.com', '', 'דנה')]);
    const cp1255 = Buffer.concat([Buffer.from('dana@x.com,'), Buffer.from([0xe3, 0xf0, 0xe4])]); // "דנה"
    expect(parser.fromFile(cp1255).rows).toEqual([row('dana@x.com', '', 'דנה')]);
  });

  it('reads the first sheet of an Excel file, including IDs stored as numbers', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['מייל', 'מספר', 'שם מלא'],
      ['uri@x.com', 12345678, 'אורי'],
      ['avi@x.com', '', 'אבי לוי'],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Roster');
    const data = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    expect(parser.fromFile(data)).toEqual({
      rows: [row('uri@x.com', '012345678', 'אורי'), row('avi@x.com', '', 'אבי לוי')],
      skipped: [],
    });
  });
});
