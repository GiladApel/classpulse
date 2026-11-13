import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import AppShell from '../components/AppShell';
import ClassChart from '../components/ClassChart';
import { Button, Card, ErrorText, inputClass } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { type AssignmentRecord, type GuideOutline, MAX_CHECKS, openHomeworkPdf, type Rubric, type SubmissionDto, type SubmissionRecord } from '../lib/content';
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

const when = (iso: string) => parseDate(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

/** Lecturer: the rubric (and the notes that steer it), every student's checks and hand-in with the AI's grade, the chart and the class analysis. */
export default function AssignmentAdminPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const hw = useLiveRecords<AssignmentRecord>('assignments', pb.filter('id = {:a}', { a: id }))[0];
  // Live rows only signal a change: the grades are hidden fields, so the table itself comes from the API.
  const live = useLiveRecords<SubmissionRecord>('submissions', pb.filter('assignment = {:a}', { a: id }));
  const [rows, setRows] = useState<SubmissionDto[]>([]);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [notes, setNotes] = useState('');
  const [insights, setInsights] = useState<Insights | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const changeKey = live.map((s) => `${s.id}${s.status}${s.check_count}${s.final_status}`).join();

  useEffect(() => {
    api.get<Insights | null>(`/assignments/${id}/insights`).then(setInsights, () => {});
  }, [id]);
  useEffect(() => {
    api.get<SubmissionDto[]>(`/assignments/${id}/submissions`).then(setRows, () => {});
  }, [id, changeKey]);
  useEffect(() => {
    api.get<Rubric>(`/assignments/${id}/rubric`).then((r) => {
      setRubric(r);
      setNotes(r.notes);
    }, () => {});
  }, [id, hw?.guide_status, rows.some((r) => r.handedInAt)]);

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
  const rebuild = () =>
    run('rubric', async () => {
      if (!confirm('לבנות את המחוון מחדש לפי ההנחיות? בדיקות התרגול שכבר נעשו נשארות לפי המחוון הקודם.')) return;
      await api.put(`/assignments/${id}/rubric`, { notes });
    });
  const regrade = (submissionId: string) => run(`final-${submissionId}`, () => api.post(`/submissions/${submissionId}/final/retry`));
  const remove = () =>
    run('delete', async () => {
      if (!hw || !confirm(`למחוק את "${hw.title}"? הקובץ, המחוון, הבדיקות וההגשות של הסטודנטים יימחקו.`)) return;
      await api.del(`/assignments/${id}`);
      navigate(hw.session ? `/lesson/${hw.session}?tab=homework` : `/course/${hw.course}?tab=homework`, { replace: true });
    });

  const guide = rubric?.guide ?? null;
  const outline: GuideOutline | null = guide && { questions: guide.questions };
  const handedIn = rows.filter((s) => s.handedInAt);
  const graded = handedIn.filter((s) => s.finalStatus === 'done');
  const sorted = [...rows].sort((a, b) => (b.finalTotal ?? -1) - (a.finalTotal ?? -1) || a.studentName.localeCompare(b.studentName));

  return (
    <AppShell back={hw ? (hw.session ? `/lesson/${hw.session}?tab=homework` : `/course/${hw.course}?tab=homework`) : '/dash'} wide>
      {hw && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{hw.title}</h1>
              {hw.due_at && <p className="text-sm text-slate-500">להגשה עד {when(hw.due_at)}</p>}
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

          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold">מחוון הבדיקה</h2>
            {hw.guide_status === 'generating' && (
              <p className="flex items-center gap-2 text-slate-600">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                ה-AI קורא את המטלה ובונה את המחוון…
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
            {hw.guide_status === 'ready' && guide && (
              <>
                {guide.instructions && <p className="text-sm text-slate-600">{guide.instructions}</p>}
                <ol className="flex flex-col gap-3 text-sm">
                  {guide.questions.map((q, qi) => (
                    <li key={q.id}>
                      <b>
                        {qi + 1}. {q.title}
                      </b>
                      <ul className="ms-4 flex list-disc flex-col gap-1 text-slate-700">
                        {q.sections.map((s) => (
                          <li key={s.id}>
                            {s.asked}
                            {s.requirements.length > 0 && <span className="text-slate-500"> — {s.requirements.join(' · ')}</span>}
                            <details className="text-slate-600">
                              <summary className="cursor-pointer text-xs text-indigo-700">תשובה מצופה</summary>
                              <p className="whitespace-pre-line">{s.expected}</p>
                              {s.givingAway && <p className="text-xs text-slate-500">לא לגלות לסטודנט: {s.givingAway}</p>}
                            </details>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              הנחיות ל-AI למחוון
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={3000}
                rows={3}
                disabled={rubric?.locked}
                placeholder="מה חשוב לכם שהמחוון יבדוק, מה להחמיר ומה לא לדרוש"
                className={inputClass}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={rebuild} disabled={!!busy || !rubric || rubric.locked || hw.guide_status === 'generating'}>
                {busy === 'rubric' ? 'שולח…' : 'עדכון המחוון'}
              </Button>
              <p className="text-xs text-slate-400">
                {rubric?.locked ? 'כבר יש הגשות — המחוון נעול כדי שכל ההגשות ייבדקו לפיו.' : 'הסטודנטים לא רואים את המחוון ולא את ההנחיות, רק משוב על הפתרון שלהם.'}
              </p>
            </div>
          </Card>

          {graded.length > 0 && (
            <Card>
              <ClassChart assignmentId={id} outline={outline} refreshKey={changeKey} />
            </Card>
          )}

          <Card className="overflow-x-auto p-0">
            <h2 className="px-3 pt-3 font-semibold">
              סטודנטים ({handedIn.length} הגישו מתוך {rows.length})
            </h2>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {['שם', 'מס׳ סטודנט', 'בדיקות', 'הגשה', 'ציון AI'].map((h) => (
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
                        {s.studentName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums" dir="ltr">
                      {s.studentNumber}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {s.checkCount}/{MAX_CHECKS}
                    </td>
                    <td className="px-3 py-2">
                      {s.handedInAt ? when(s.handedInAt) : <span className="text-slate-400">לא הוגש</span>}
                      {s.handedInAt && s.late && <span className="ms-1 text-red-600">(באיחור)</span>}
                    </td>
                    <td className="px-3 py-2">
                      {s.finalStatus === 'done' && <b className="tabular-nums">{s.finalTotal}</b>}
                      {s.finalStatus === 'processing' && <span className="text-slate-500">בבדיקה…</span>}
                      {s.finalStatus === 'failed' && (
                        <span className="flex items-center gap-2">
                          <span className="text-red-600" title={s.finalError}>
                            נכשל
                          </span>
                          <button onClick={() => regrade(s.id)} disabled={!!busy} className="text-indigo-700 hover:underline">
                            ניסיון נוסף
                          </button>
                        </span>
                      )}
                      {!s.finalStatus && '—'}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      עוד אף אחד לא בדק או הגיש.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">ניתוח ההגשות</h2>
            <Button onClick={analyze} disabled={!!busy || graded.length === 0}>
              {busy === 'insights' ? 'מנתח…' : '✨ ניתוח ההגשות'}
            </Button>
          </div>
          {insights && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <h3 className="mb-2 font-semibold">טעויות נפוצות ({insights.submissionCount} הגשות)</h3>
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
                <h3 className="mb-2 font-semibold">הגשות דומות מאוד — לבדיקה ידנית</h3>
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
                <p className="mt-2 text-xs text-slate-400">דמיון בטקסט של קובצי PDF שהוגשו — סימן לבדיקה, לא הוכחה להעתקה. הגשות מצולמות לא נבדקות. רק אתם רואים את הרשימה.</p>
              </Card>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
