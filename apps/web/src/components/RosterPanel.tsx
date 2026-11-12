import type { RecordModel } from 'pocketbase';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';
import { Button, Card, ErrorText, inputClass } from './ui';

interface EnrollmentRecord extends RecordModel {
  student_number: string;
  name: string;
}

interface ImportResult {
  added: number;
  updated: number;
  skipped: { line: number; text: string; reason: 'NO_ID' | 'DUPLICATE' }[];
}

const pickButton = 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium';

/** Lecturer: who is enrolled. Upload Excel/CSV or paste a list; add or remove one student; see who checked in without being on it. */
export default function RosterPanel({ courseId }: { courseId: string }) {
  const roster = useLiveRecords<EnrollmentRecord>('enrollments', pb.filter('course = {:c}', { c: courseId }), 'name');
  const [signedUp, setSignedUp] = useState<Map<string, string>>(new Map());
  const [walkIns, setWalkIns] = useState<Map<string, string>>(new Map());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [paste, setPaste] = useState('');

  const numbers = useMemo(() => roster.map((e) => e.student_number).sort(), [roster]);

  // The Google name next to the roster name, so a student who typed someone else's ID stands out.
  useEffect(() => {
    if (numbers.length === 0) return setSignedUp(new Map());
    const chunks = Array.from({ length: Math.ceil(numbers.length / 40) }, (_, i) => numbers.slice(i * 40, i * 40 + 40));
    Promise.all(
      chunks.map((c) => pb.collection('users').getFullList({ filter: c.map((n) => pb.filter('student_id = {:n}', { n })).join(' || '), fields: 'student_id,name' })),
    ).then((lists) => setSignedUp(new Map(lists.flat().map((u) => [u.student_id as string, u.name as string]))), () => {});
  }, [numbers]);

  useEffect(() => {
    pb.collection('attendance_records')
      .getFullList({ filter: pb.filter("session.course = {:c} && status != 'removed'", { c: courseId }), fields: 'student_number,student_name' })
      .then((list) => setWalkIns(new Map(list.map((r) => [r.student_number as string, r.student_name as string]))), () => {});
  }, [courseId, roster.length]);

  const notOnRoster = [...walkIns].filter(([n]) => !numbers.includes(n));

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError('');
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה');
    } finally {
      setBusy('');
    }
  };

  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    return run('file', async () => setResult(await api.upload<ImportResult>(`/courses/${courseId}/roster`, form)));
  };

  const addPasted = (e: FormEvent) => {
    e.preventDefault();
    return run('paste', async () => {
      setResult(await api.post<ImportResult>(`/courses/${courseId}/roster`, { text: paste }));
      setPaste('');
    });
  };

  const addOne = (studentNumber: string, name: string) => run(`add-${studentNumber}`, () => api.post(`/courses/${courseId}/enrollments`, { studentNumber, name }));

  const remove = (e: EnrollmentRecord) =>
    run(`remove-${e.student_number}`, async () => {
      if (confirm(`להסיר את ${e.name || e.student_number} מהקורס?`)) await api.del(`/courses/${courseId}/enrollments/${e.student_number}`);
    });

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">רשימת הסטודנטים</h2>
          <p className="text-sm text-slate-500">מי שברשימה רואה את הקורס באפליקציה מיד כשנרשם עם מספר הסטודנט שלו. העלאה חוזרת מוסיפה ומעדכנת שמות, ולא מוחקת.</p>
        </div>
        <label className={`${pickButton} bg-indigo-600 text-white hover:bg-indigo-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          {busy === 'file' ? 'מעלה…' : '📎 העלאת קובץ Excel או CSV'}
          <input type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" aria-label="קובץ רשימה" className="hidden" onChange={upload} />
        </label>
        <form onSubmit={addPasted} className="flex flex-col gap-2">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            dir="auto"
            placeholder={'או הדביקו רשימה, שורה לכל סטודנט:\n123456789 דנה כהן'}
            aria-label="רשימה להדבקה"
            className={inputClass}
          />
          <Button type="submit" variant="secondary" disabled={!!busy || !paste.trim()}>
            הוספת הרשימה
          </Button>
        </form>
        {result && (
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
            נוספו {result.added}, עודכנו {result.updated}
            {result.skipped.length > 0 && (
              <ul className="mt-1 list-disc ps-5 text-amber-800">
                {result.skipped.map((s) => (
                  <li key={s.line}>
                    שורה {s.line}: {s.reason === 'DUPLICATE' ? 'מופיעה פעמיים' : 'אין מספר סטודנט'} — {s.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </Card>

      {notOnRoster.length > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold">סימנו נוכחות אבל לא ברשימה ({notOnRoster.length})</h2>
          <p className="mb-2 text-sm text-slate-500">למשל סטודנט/ית שנרשמו מאוחר. הוספה נותנת להם גישה לקורס.</p>
          <ul className="divide-y divide-slate-100">
            {notOnRoster.map(([n, name]) => (
              <li key={n} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {name} <span className="text-sm tabular-nums text-slate-500" dir="ltr">{n}</span>
                </span>
                <Button variant="secondary" className="text-sm" disabled={!!busy} onClick={() => addOne(n, name)}>
                  הוספה לקורס
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-start text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['שם ברשימה', 'מס׳ סטודנט', 'רשום/ה באפליקציה', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roster.map((e) => {
              const google = signedUp.get(e.student_number);
              return (
                <tr key={e.id}>
                  <td className="px-3 py-2 font-medium">{e.name || '—'}</td>
                  <td className="px-3 py-2 tabular-nums" dir="ltr">
                    {e.student_number}
                  </td>
                  <td className="px-3 py-2">{google ? <span className="text-emerald-700">✓ {google}</span> : <span className="text-slate-400">עוד לא</span>}</td>
                  <td className="px-3 py-2 text-end">
                    <button onClick={() => remove(e)} className="text-xs text-red-600 hover:underline">
                      הסרה
                    </button>
                  </td>
                </tr>
              );
            })}
            {roster.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                  הרשימה ריקה. העלו קובץ או הדביקו רשימה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{roster.length} סטודנטים</p>
      </Card>
    </>
  );
}
