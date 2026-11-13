import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import AppShell from '../components/AppShell';
import HomeworkReport from '../components/HomeworkReport';
import { Button, Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { MAX_CHECKS, openHandInFile, type SubmissionView } from '../lib/content';
import { parseDate } from '../lib/device';

/** Lecturer: one student's hand-in (files and the AI's grading draft) and their last practice check. */
export default function SubmissionPage() {
  const { id = '' } = useParams();
  const [view, setView] = useState<SubmissionView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get<SubmissionView>(`/submissions/${id}`).then(setView, (e) => setError(e instanceof ApiError ? e.message : 'ההגשה לא נמצאה'));
  useEffect(() => {
    load();
  }, [id]);

  // Grading runs in the background; poll while it does.
  const grading = view?.submission.finalStatus === 'processing';
  useEffect(() => {
    if (!grading) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [grading]);

  const regrade = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/submissions/${id}/final/retry`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  const s = view?.submission;
  return (
    <AppShell back={s ? `/dash/assignment/${s.assignmentId}` : '/dash'}>
      <ErrorText>{error}</ErrorText>
      {view && s && (
        <>
          <Card className="flex flex-col gap-2">
            <h1 className="text-xl font-bold">{s.studentName}</h1>
            <p className="text-sm text-slate-500" dir="auto">
              {s.studentNumber} · {s.checkCount}/{MAX_CHECKS} בדיקות
            </p>
            {s.handedInAt ? (
              <>
                <p>
                  הוגש ב-{parseDate(s.handedInAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  {s.late && <span className="ms-2 text-red-600">באיחור</span>}
                </p>
                <ul className="flex flex-wrap gap-3 text-sm">
                  {s.files.map((f, i) => (
                    <li key={f}>
                      <button onClick={() => openHandInFile(s.id, f)} className="text-indigo-700 hover:underline">
                        📎 קובץ {i + 1}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-slate-500">עוד לא הוגש.</p>
            )}
          </Card>

          {s.handedInAt && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-semibold">הערכת ה-AI להגשה (טיוטה, רק לכם)</h2>
              {s.finalStatus === 'processing' && <p className="text-slate-600">ה-AI בודק את ההגשה…</p>}
              {s.finalStatus === 'failed' && (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-red-700">{s.finalError || 'בדיקת ההגשה נכשלה'}</p>
                  <Button variant="secondary" onClick={regrade} disabled={busy}>
                    {busy ? 'שולח…' : 'ניסיון נוסף'}
                  </Button>
                </div>
              )}
              {s.finalStatus === 'done' && s.finalReport && view.outline && <HomeworkReport report={s.finalReport} total={s.finalTotal ?? null} outline={view.outline} lecturer />}
            </Card>
          )}

          {s.report && view.outline && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-semibold">בדיקת התרגול האחרונה (מה שהסטודנט ראה)</h2>
              <HomeworkReport report={s.report} total={s.total} outline={view.outline} lecturer />
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
