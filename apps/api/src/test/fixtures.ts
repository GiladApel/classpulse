import type { CheckInContext } from '../attendance/CheckInRule.js';
import type { Session } from '../attendance/types.js';

export const T0 = new Date('2026-11-05T08:00:00.000Z');
export const CLASSROOM = { lat: 32.1048, lng: 35.2073 };

export function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: 'sess1',
    courseId: 'course1',
    lecturerId: 'lect1',
    title: 'Lecture 5',
    status: 'active',
    startedAt: T0,
    location: CLASSROOM,
    geofenceMode: 'lenient',
    geofenceRadiusM: 50,
    qrSecret: 'test-secret',
    ...over,
  };
}

export function makeCtx(over: Partial<CheckInContext> = {}): CheckInContext {
  return {
    session: makeSession(),
    studentId: 'u1',
    studentNumber: '123456789',
    studentName: 'דנה כהן',
    deviceId: 'dev-1',
    token: '',
    location: CLASSROOM,
    now: T0,
    ...over,
  };
}

/** Point roughly `meters` north of `from`. */
export const north = (from: { lat: number; lng: number }, meters: number) => ({
  lat: from.lat + meters / 111_320,
  lng: from.lng,
});

/** A one-page PDF with a single line of text, with a correct xref table. */
export function minimalPdf(line: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${line}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
