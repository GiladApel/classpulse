import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import AppShell from '../components/AppShell';
import { Button, Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { type AssignmentRecord, MAX_CHECKS, openHomeworkPdf } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';

interface Who {
  submissionId: string;
  studentName: string;
  studentNumber: string;
}

interface Insights {
  submissionCount: number;
  commonMistakes: { title: string; description: string; count: number }[];
  similarPairs: { a: Who; b: Who; similarity: number }[];
  builtAt: string;
}

type SubmissionRecord = RecordModel & {
  student_name: string;
  student_number: string;
  status: 'processing' | 'done' | 'failed';
  check_count: number;
  total: number;
  late: boolean;
  submitted_at: string;
  error: string;
};

/** Lecturer: the homework's guide status, every student's latest check, the class analysis and pairs to check by hand. */
export default function AssignmentAdminPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const hw = useLiveRecords<AssignmentRecord>('assignments', pb.filter('id = {:a}', { a: id }))[0];
  const submissions = useLiveRecords<SubmissionRecord>('submissions', pb.filter('assignment = {:a}', { a: id }), 'submitted_at');
  const [insights, setInsights] = useState<Insights | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Insights | null>(`/assignments/${id}/insights`).then(setInsights, () => {});
  }, [id]);

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

  const analyze = () => run('insights', async () => setInsights(await api.post<Insights>(`/assignments/${id}/insights`)));
  const retry = () => run('retry', () => api.post(`/assignments/${id}/guide/retry`));
  const remove = () =>
    run('delete', async () => {
      if (!hw || !confirm(`למחוק את "${hw.title}"? הקובץ, מדריך הבדיקה והבדיקות של הסטודנטים יימחקו.`)) return;
      await api.del(`/assignments/${id}`);
      navigate(hw.session ? `/lesson/${hw.session}?tab=homework` : `/course/${hw.course}?tab=homework`, { replace: true });
    });

  const checked = submissions.filter((s) => s.total >= 0);
  const sorted = [...submissions].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));

  return (
    <AppShell back={hw ? (hw.session ? `/lesson/${hw.session}?tab=homework` : `/course/${hw.course}?tab=homework`) : '/dash'} wide>
      {hw && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{hw.title}</h1>
              {hw.due_at && <p className="text-sm text-slate-500">להגשה עד {parseDate(hw.due_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => openHomeworkPdf(hw)}>
                📄 המטלה
              </Button>
              <Button variant="danger" onClick={remove} disabled={!!busy}>
                מחיקת המטלה
              </Button>
            </div>
          </div>
          <ErrorText>{error}</ErrorText>

          <Card>
            <h2 className="mb-2 font-semibold">מדריך הבדיקה</h2>
            {hw.guide_status === 'generating' && (
              <p className="flex items-center gap-2 text-slate-600">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                ה-AI קורא את המטלה ומחלק אותה לשאלות ולסעיפים…
              </p>
            )}
            {hw.guide_status === 'failed' && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-red-700">{hw.guide_error || 'קריאת המטלה נכשלה'}</p>
                <Button variant="secondary" onClick={retry} disabled={!!busy}>
                  {busy === 'retry' ? 'מנסה…' : 'ניסיון נוסף'}
                </Button>
              </div>
            )}
            {hw.outline && (
              <ol className="flex flex-col gap-2 text-sm">
                {hw.outline.questions.map((q, qi) => (
                  <li key={q.id}>
                    <b>
                      {qi + 1}. {q.title}
                    </b>
                    <ul className="ms-4 list-disc text-slate-700">
                      {q.sections.map((s) => (
                        <li key={s.id}>
                          {s.asked}
                          {s.requirements.length > 0 && <span className="text-slate-500"> — {s.requirements.join(' · ')}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
            {hw.outline && <p className="mt-2 text-xs text-slate-400">הסטודנטים רואים את השאלות והדרישות. התשובות שה-AI מצפה להן נשארות בשרת.</p>}
          </Card>

          <Card className="overflow-x-auto p-0">
            <h2 className="px-3 pt-3 font-semibold">סטודנטים שבדקו ({checked.length})</h2>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {['שם', 'מס׳ סטודנט', 'בדיקות', 'בדיקה אחרונה', 'סטטוס', 'ציון'].map((h) => (
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
                    <td className="px-3 py-2 tabular-nums">
                      {s.check_count}/{MAX_CHECKS}
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
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      עוד אף אחד לא בדק פתרון.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">ניתוח הכיתה</h2>
            <Button onClick={analyze} disabled={!!busy || checked.length === 0}>
              {busy === 'insights' ? 'מנתח…' : '✨ ניתוח הכיתה'}
            </Button>
          </div>
          {insights && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <h3 className="mb-2 font-semibold">טעויות נפוצות ({insights.submissionCount} בדיקות)</h3>
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
              <Card>
                <h3 className="mb-2 font-semibold">פתרונות דומים מאוד — לבדיקה ידנית</h3>
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
                <p className="mt-2 text-xs text-slate-400">דמיון בטקסט של קובצי PDF — סימן לבדיקה, לא הוכחה להעתקה. פתרונות מצולמים לא נבדקים. רק אתם רואים את הרשימה.</p>
              </Card>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
