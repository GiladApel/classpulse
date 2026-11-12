import type { RecordModel } from 'pocketbase';
import { type ChangeEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import AppShell from '../components/AppShell';
import ClassChart from '../components/ClassChart';
import HomeworkReport from '../components/HomeworkReport';
import { Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { type AssignmentRecord, MAX_CHECKS, openHomeworkPdf, type SubmissionView } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';

const pickButton = 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium';

/** Student: read the homework, check a solution before handing it in (up to 3 times), see the report and where I stand. */
export default function AssignmentPage() {
  const { id = '' } = useParams();
  const userId = pb.authStore.record?.id ?? '';
  const [assignment, setAssignment] = useState<AssignmentRecord | null>(null);
  const [view, setView] = useState<SubmissionView | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const live = useLiveRecords<AssignmentRecord>('assignments', pb.filter('id = {:a}', { a: id }))[0];
  const mine = useLiveRecords<RecordModel & { status: string; check_count: number }>('submissions', pb.filter('assignment = {:a} && student = {:u}', { a: id, u: userId }))[0];

  useEffect(() => {
    pb.collection('assignments').getOne<AssignmentRecord>(id).then(setAssignment, () => setError('המטלה לא נמצאה או שאינכם רשומים לקורס'));
  }, [id]);
  const hw = live ?? assignment;

  // The API adds the outline, the place in the class and the class-wide mistakes.
  useEffect(() => {
    if (!mine) return setView(null);
    api.get<SubmissionView>(`/submissions/${mine.id}`).then(setView, () => {});
  }, [mine?.id, mine?.status, mine?.check_count]);

  const check = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    setError('');
    setSending(true);
    try {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      await api.upload(`/assignments/${id}/checks`, form);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הבדיקה לא התחילה');
    } finally {
      setSending(false);
    }
  };

  const due = hw?.due_at ? parseDate(hw.due_at) : null;
  const used = mine?.check_count ?? 0;
  const left = MAX_CHECKS - used;
  const busy = sending || mine?.status === 'processing';

  return (
    <AppShell back={hw ? (hw.session ? `/lesson/${hw.session}?tab=homework` : `/course/${hw.course}?tab=homework`) : '/'}>
      <ErrorText>{error}</ErrorText>
      {hw && (
        <>
          <Card className="flex flex-col gap-2">
            <h1 className="text-xl font-bold">{hw.title}</h1>
            {due && <p className={`text-sm ${due < new Date() ? 'text-red-600' : 'text-slate-500'}`}>להגשה עד {due.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>}
            <button onClick={() => openHomeworkPdf(hw)} className="self-start text-indigo-700 hover:underline">
              📄 פתיחת המטלה (PDF)
            </button>
            {hw.guide_status === 'generating' && <p className="text-sm text-slate-500">ה-AI עוד קורא את המטלה; הבדיקה תיפתח בעוד רגע.</p>}
            {hw.guide_status === 'failed' && <p className="text-sm text-amber-700">המטלה עוד לא מוכנה לבדיקה. המרצה צריך/ה לנסות שוב.</p>}
            {hw.outline && (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600">מה בודקים בכל סעיף</summary>
                <ol className="mt-2 flex flex-col gap-2">
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
              </details>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">משוב לפני הגשה</h2>
                <p className="text-sm text-slate-500">
                  נותרו {left} מתוך {MAX_CHECKS} בדיקות · PDF אחד או עד 10 תמונות של פתרון בכתב יד. הקובץ לא נשמר.
                </p>
              </div>
              <label className={`${pickButton} bg-indigo-600 text-white hover:bg-indigo-700 ${busy || left <= 0 || hw.guide_status !== 'ready' ? 'pointer-events-none opacity-50' : ''}`}>
                {busy ? 'בודק…' : used === 0 ? '✨ קבלת משוב' : '✨ בדיקה נוספת'}
                <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="קובץ הפתרון" className="hidden" onChange={check} />
              </label>
            </div>
            {left <= 0 && <p className="text-sm text-slate-600">זו הייתה הבדיקה האחרונה — התוצאה שלה היא הסופית.</p>}
            {view && <HomeworkReport view={view} />}
          </Card>

          {mine && mine.check_count > 0 && (
            <Card>
              <ClassChart assignmentId={id} outline={hw.outline} refreshKey={`${mine.status}-${mine.check_count}`} />
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
