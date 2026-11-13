import { type ChangeEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import AppShell from '../components/AppShell';
import HomeworkReport from '../components/HomeworkReport';
import { Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { type AssignmentRecord, MAX_CHECKS, openHandInFile, openHomeworkPdf, type SubmissionRecord, type SubmissionView } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';

const pickButton = 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium';
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const when = (iso: string) => parseDate(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

/** Student: read the homework, get feedback on a solution (up to MAX_CHECKS times), then hand in once. */
export default function AssignmentPage() {
  const { id = '' } = useParams();
  const userId = pb.authStore.record?.id ?? '';
  const [assignment, setAssignment] = useState<AssignmentRecord | null>(null);
  const [view, setView] = useState<SubmissionView | null>(null);
  const [sending, setSending] = useState<'' | 'check' | 'handin'>('');
  const [error, setError] = useState('');
  const live = useLiveRecords<AssignmentRecord>('assignments', pb.filter('id = {:a}', { a: id }))[0];
  const mine = useLiveRecords<SubmissionRecord>('submissions', pb.filter('assignment = {:a} && student = {:u}', { a: id, u: userId }))[0];

  useEffect(() => {
    pb.collection('assignments').getOne<AssignmentRecord>(id).then(setAssignment, () => setError('המטלה לא נמצאה או שאינכם רשומים לקורס'));
  }, [id]);
  const hw = live ?? assignment;

  // The API adds the questions of the homework (without the rubric) and the class-wide mistakes.
  useEffect(() => {
    if (!mine) return setView(null);
    api.get<SubmissionView>(`/submissions/${mine.id}`).then(setView, () => {});
  }, [mine?.id, mine?.status, mine?.check_count, mine?.handed_in_at]);

  const send = (kind: 'check' | 'handin') => async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    if (kind === 'handin' && !confirm('הגשה סופית — אחרי ההגשה אי אפשר להחליף את הקבצים ואין עוד בדיקות. להגיש?')) return;
    setError('');
    setSending(kind);
    try {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      await api.upload(`/assignments/${id}/${kind === 'check' ? 'checks' : 'handin'}`, form);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : kind === 'check' ? 'הבדיקה לא התחילה' : 'ההגשה נכשלה');
    } finally {
      setSending('');
    }
  };

  const due = hw?.due_at ? parseDate(hw.due_at) : null;
  const used = mine?.check_count ?? 0;
  const left = MAX_CHECKS - used;
  const handedIn = !!mine?.handed_in_at;
  const checking = sending === 'check' || mine?.status === 'processing';
  const open = hw?.guide_status === 'ready' && !handedIn;
  const practice = view?.submission;

  return (
    <AppShell back={hw ? (hw.session ? `/lesson/${hw.session}?tab=homework` : `/course/${hw.course}?tab=homework`) : '/'}>
      <ErrorText>{error}</ErrorText>
      {hw && (
        <>
          <Card className="flex flex-col gap-2">
            <h1 className="text-xl font-bold">{hw.title}</h1>
            {due && <p className={`text-sm ${due < new Date() ? 'text-red-600' : 'text-slate-500'}`}>להגשה עד {when(hw.due_at)}</p>}
            <button onClick={() => openHomeworkPdf(hw)} className="self-start text-indigo-700 hover:underline">
              📄 פתיחת המטלה (PDF)
            </button>
            {hw.guide_status === 'generating' && <p className="text-sm text-slate-500">ה-AI עוד קורא את המטלה; הבדיקה וההגשה ייפתחו בעוד רגע.</p>}
            {hw.guide_status === 'failed' && <p className="text-sm text-amber-700">המטלה עוד לא מוכנה. המרצה צריך/ה לנסות שוב.</p>}
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">משוב לפני הגשה</h2>
                <p className="text-sm text-slate-500">
                  {handedIn ? 'המטלה הוגשה — אין עוד בדיקות.' : `נותרו ${left} מתוך ${MAX_CHECKS} בדיקות`} · PDF אחד או עד 10 תמונות. קובץ הבדיקה לא נשמר.
                </p>
              </div>
              {!handedIn && (
                <label className={`${pickButton} bg-indigo-600 text-white hover:bg-indigo-700 ${checking || left <= 0 || !open ? 'pointer-events-none opacity-50' : ''}`}>
                  {checking ? 'בודק…' : used === 0 ? '✨ קבלת משוב' : '✨ בדיקה נוספת'}
                  <input type="file" multiple accept={ACCEPT} aria-label="קובץ הפתרון" className="hidden" onChange={send('check')} />
                </label>
              )}
            </div>
            {mine?.status === 'processing' && (
              <p className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-indigo-900">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                ה-AI בודק את הפתרון… זה לוקח בדרך כלל פחות מדקה.
              </p>
            )}
            {mine?.status === 'failed' && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{mine.error || 'הבדיקה נכשלה — נסו שוב (הבדיקה לא נספרה)'}</p>}
            {!handedIn && left <= 0 && <p className="text-sm text-slate-600">ניצלתם את הבדיקות — אפשר לתקן לפי המשוב ולהגיש.</p>}
            {practice?.report && view?.outline && <HomeworkReport report={practice.report} total={practice.total} outline={view.outline} commonMistakes={view.commonMistakes} />}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold">הגשת המטלה</h2>
            {handedIn && mine ? (
              <>
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900">
                  ✓ הוגש ב-{when(mine.handed_in_at)}
                  {mine.late && <span className="ms-1 text-red-600">(באיחור)</span>}
                </p>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {mine.files.map((f, i) => (
                    <li key={f}>
                      <button onClick={() => openHandInFile(mine.id, f)} className="text-indigo-700 hover:underline">
                        📎 קובץ {i + 1}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-500">הגשה אחת סופית: PDF אחד או עד 10 תמונות. הקבצים נשמרים למרצה.</p>
                <label className={`${pickButton} border border-indigo-600 text-indigo-700 hover:bg-indigo-50 ${sending || checking || !open ? 'pointer-events-none opacity-50' : ''}`}>
                  {sending === 'handin' ? 'מגיש…' : '📤 הגשה סופית'}
                  <input type="file" multiple accept={ACCEPT} aria-label="קובץ ההגשה" className="hidden" onChange={send('handin')} />
                </label>
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
