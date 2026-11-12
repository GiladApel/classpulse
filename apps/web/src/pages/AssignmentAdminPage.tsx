import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { AssignmentRecord } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';

interface Histogram {
  buckets: number[];
  counts: number[];
}

interface Who {
  submissionId: string;
  studentName: string;
  studentNumber: string;
}

interface Insights {
  submissionCount: number;
  distribution: { total: Histogram; criteria: Record<string, { mean: number; histogram: Histogram }> };
  commonMistakes: { title: string; description: string; count: number }[];
  similarPairs: { a: Who; b: Who; similarity: number }[];
  builtAt: string;
}

type SubmissionRecord = RecordModel & { student_name: string; student_number: string; status: string; total: number; late: boolean; submitted_at: string; error: string };

function Bars({ h }: { h: Histogram }) {
  const max = Math.max(1, ...h.counts);
  return (
    <div className="flex h-24 items-end gap-1" dir="ltr">
      {h.counts.map((c, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-t bg-indigo-500" style={{ height: `${(c / max) * 72}px` }} title={`${h.buckets[i]}–${h.buckets[i] + 9}: ${c}`} />
          <span className="text-[10px] text-slate-500">{h.buckets[i]}</span>
        </div>
      ))}
    </div>
  );
}

/** Lecturer: live submissions, class analysis (distribution, common mistakes) and pairs to check by hand. */
export default function AssignmentAdminPage() {
  const { id = '' } = useParams();
  const [assignment, setAssignment] = useState<AssignmentRecord | null>(null);
  const submissions = useLiveRecords<SubmissionRecord>('submissions', pb.filter('assignment = {:a}', { a: id }), 'submitted_at');
  const [insights, setInsights] = useState<Insights | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    pb.collection('assignments').getOne<AssignmentRecord>(id).then(setAssignment, () => setError('המטלה לא נמצאה'));
    api.get<Insights | null>(`/assignments/${id}/insights`).then(setInsights, () => {});
  }, [id]);

  const analyze = async () => {
    setError('');
    setBusy(true);
    try {
      setInsights(await api.post<Insights>(`/assignments/${id}/insights`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  const done = submissions.filter((s) => s.status === 'done');
  const sorted = [...submissions].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 p-4 md:p-8">
      {assignment && (
        <Link to={`/course/${assignment.course}?tab=homework`} className="text-sm text-indigo-600 hover:underline">
          → מטלות הקורס
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{assignment?.title}</h1>
        <Button onClick={analyze} disabled={busy || done.length === 0}>
          {busy ? 'מנתח…' : '✨ ניתוח הכיתה'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>

      {insights && assignment && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="mb-2 font-semibold">התפלגות ציונים ({insights.submissionCount} הגשות)</h2>
            <Bars h={insights.distribution.total} />
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {assignment.rubric.map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>{c.criterion}</span>
                  <span className="tabular-nums text-slate-600">ממוצע {insights.distribution.criteria[c.id]?.mean ?? '—'}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">טעויות נפוצות</h2>
            {insights.commonMistakes.length === 0 && <p className="text-sm text-slate-500">לא נמצאו טעויות חוזרות.</p>}
            <ul className="flex flex-col gap-2 text-sm">
              {insights.commonMistakes.map((m) => (
                <li key={m.title}>
                  <span className="font-medium">{m.title}</span> <span className="text-slate-500">({m.count})</span>
                  {m.description && <p className="text-slate-600">{m.description}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-400">הסטודנטים רואים את הרשימה הזו בלי שמות.</p>
          </Card>
          <Card className="md:col-span-2">
            <h2 className="mb-2 font-semibold">הגשות דומות מאוד — לבדיקה ידנית</h2>
            {insights.similarPairs.length === 0 ? (
              <p className="text-sm text-slate-500">לא נמצאו זוגות דומים.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {insights.similarPairs.map((p) => (
                  <li key={`${p.a.submissionId}-${p.b.submissionId}`} className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-red-50 px-2 py-0.5 tabular-nums text-red-800">{Math.round(p.similarity * 100)}%</span>
                    <Link to={`/hw/${p.a.submissionId}`} className="text-indigo-700 hover:underline">
                      {p.a.studentName}
                    </Link>
                    ↔
                    <Link to={`/hw/${p.b.submissionId}`} className="text-indigo-700 hover:underline">
                      {p.b.studentName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">דמיון במבנה הקוד או בטקסט (גם אחרי שינוי שמות משתנים) — סימן לבדיקה, לא הוכחה להעתקה. רק אתם רואים את הרשימה.</p>
          </Card>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['שם', 'מס׳ סטודנט', 'הוגש', 'סטטוס', 'ציון'].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link to={`/hw/${s.id}`} className="font-medium text-indigo-700 hover:underline">
                    {s.student_name}
                  </Link>
                </td>
                <td className="px-3 py-2 tabular-nums" dir="ltr">
                  {s.student_number}
                </td>
                <td className="px-3 py-2">
                  {parseDate(s.submitted_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  {s.late && <span className="ms-1 text-red-600">(באיחור)</span>}
                </td>
                <td className="px-3 py-2">{s.status === 'done' ? 'נבדק' : s.status === 'processing' ? 'בבדיקה…' : <span className="text-red-600" title={s.error}>נכשל</span>}</td>
                <td className="px-3 py-2 font-bold tabular-nums">{s.total >= 0 ? s.total : '—'}</td>
              </tr>
            ))}
            {submissions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  עוד אין הגשות.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
