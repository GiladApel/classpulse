import type { RecordModel } from 'pocketbase';
import { type ChangeEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import ReviewView from '../components/ReviewView';
import { Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { AssignmentRecord, SubmissionView } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';

const ACCEPT = '.pdf,.txt,.md,.java,.py,.ts,.tsx,.js,.jsx,.c,.h,.cpp,.hpp,.cs,.go,.rs,.kt,.swift,.sql,.html,.css,.json,.xml,.yml,.yaml,.sh';

/** Student: read the assignment, upload, and watch the AI review arrive. */
export default function AssignmentPage() {
  const { id = '' } = useParams();
  const userId = pb.authStore.record?.id ?? '';
  const [assignment, setAssignment] = useState<AssignmentRecord | null>(null);
  const [view, setView] = useState<SubmissionView | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const mine = useLiveRecords<RecordModel & { status: string }>('submissions', pb.filter('assignment = {:a} && student = {:u}', { a: id, u: userId }))[0];

  useEffect(() => {
    pb.collection('assignments').getOne<AssignmentRecord>(id).then(setAssignment, () => setError('המטלה לא נמצאה או שאינכם רשומים לקורס'));
  }, [id]);

  // The API adds percentiles and class-wide mistakes, which PocketBase alone cannot compute.
  useEffect(() => {
    if (!mine) return setView(null);
    api.get<SubmissionView>(`/submissions/${mine.id}`).then(setView, () => {});
  }, [mine?.id, mine?.status]);

  const submit = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setSending(true);
    try {
      const form = new FormData();
      form.set('file', file);
      await api.upload(`/assignments/${id}/submissions`, form);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההגשה נכשלה');
    } finally {
      setSending(false);
    }
  };

  const due = assignment?.due_at ? parseDate(assignment.due_at) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      {assignment && (
        <Link to={`/course/${assignment.course}?tab=homework`} className="text-sm text-indigo-600 hover:underline">
          → לקורס
        </Link>
      )}
      <ErrorText>{error}</ErrorText>
      {assignment && (
        <>
          <Card>
            <h1 className="text-xl font-bold">{assignment.title}</h1>
            {due && <p className={`text-sm ${due < new Date() ? 'text-red-600' : 'text-slate-500'}`}>להגשה עד {due.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>}
            {assignment.description && <p className="mt-2 whitespace-pre-wrap text-slate-700">{assignment.description}</p>}
            <h2 className="mt-4 mb-1 text-sm font-semibold text-slate-600">מחוון</h2>
            <ul className="text-sm text-slate-700">
              {assignment.rubric.map((c) => (
                <li key={c.id}>
                  • {c.criterion} <span className="text-slate-400">(משקל {c.weight})</span>
                  {c.description && <span className="text-slate-500"> — {c.description}</span>}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{mine ? 'ההגשה שלי' : 'הגשה'}</h2>
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 font-medium ${mine ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'} ${sending || mine?.status === 'processing' ? 'pointer-events-none opacity-50' : ''}`}>
                📄 {mine ? 'הגשה מחדש' : 'העלאת קובץ'}
                <input type="file" accept={ACCEPT} className="hidden" onChange={submit} />
              </label>
            </div>
            {!mine && <p className="text-sm text-slate-500">PDF או קובץ קוד/טקסט, עד 10MB. ה-AI יחזיר ציון לכל קריטריון והצעות לשיפור תוך כחצי דקה.</p>}
            {sending && <p className="text-sm text-slate-600">מעלה…</p>}
            {view && (
              <>
                <p className="mb-3 text-xs text-slate-500">
                  {view.submission.filename} · {parseDate(view.submission.submittedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  {view.submission.late && <span className="ms-2 text-red-600">באיחור</span>}
                </p>
                <ReviewView view={view} rubric={assignment.rubric} />
              </>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
