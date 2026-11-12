import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../lib/api';
import type { AssignmentRecord } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';
import { Button, Card, ErrorText, Field, inputClass } from './ui';

export const GUIDE_LABEL = {
  generating: { text: 'ה-AI קורא…', className: 'bg-indigo-50 text-indigo-800' },
  ready: { text: 'פתוח לבדיקה', className: 'bg-emerald-50 text-emerald-800' },
  failed: { text: 'נכשל — לנסות שוב', className: 'bg-red-50 text-red-700' },
} as const;

/**
 * Lecturer: the homework of a course (or of one lesson, when `sessionId` is given) and publishing a new one:
 * a title, an optional due date and the homework PDF, which the AI turns into a review guide.
 */
export default function AssignmentManager({ courseId, sessionId }: { courseId: string; sessionId?: string }) {
  const filter = sessionId ? pb.filter('course = {:c} && session = {:s}', { c: courseId, s: sessionId }) : pb.filter('course = {:c}', { c: courseId });
  const assignments = useLiveRecords<AssignmentRecord>('assignments', filter, '-created_at');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const publish = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get('file');
    if (!(file instanceof File) || file.size === 0) return setError('בחרו את קובץ המטלה (PDF)');
    setError('');
    setBusy(true);
    try {
      const body = new FormData();
      body.set('title', String(f.get('title') ?? ''));
      const due = String(f.get('dueAt') ?? '');
      if (due) body.set('dueAt', new Date(due).toISOString());
      if (sessionId) body.set('sessionId', sessionId);
      body.set('file', file);
      await api.upload(`/courses/${courseId}/assignments`, body);
      form.reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'הפרסום נכשל');
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...assignments].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <Card>
        <h2 className="mb-2 font-semibold">{sessionId ? 'שיעורי הבית של השיעור' : 'שיעורי הבית של הקורס'}</h2>
        <ul className="divide-y divide-slate-100">
          {sorted.map((a) => (
            <li key={a.id}>
              <Link to={`/dash/assignment/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-indigo-700">
                <span className="font-medium">{a.title}</span>
                <span className="flex items-center gap-2 text-sm text-slate-500">
                  {a.due_at && `עד ${parseDate(a.due_at).toLocaleDateString('he-IL')}`}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${GUIDE_LABEL[a.guide_status].className}`}>{GUIDE_LABEL[a.guide_status].text}</span>
                </span>
              </Link>
            </li>
          ))}
          {assignments.length === 0 && <li className="py-3 text-slate-500">עוד אין שיעורי בית.</li>}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">פרסום שיעורי בית</h2>
        <p className="mb-3 text-sm text-slate-500">
          מעלים את המטלה כ-PDF. ה-AI מחלק אותה לשאלות ולסעיפים ומכין לכל סעיף דרישות, והסטודנטים יכולים לקבל משוב על הפתרון לפני ההגשה (עד 3 פעמים).
        </p>
        <form onSubmit={publish} className="grid gap-3 md:grid-cols-2">
          <Field label="כותרת">
            <input name="title" required maxLength={200} placeholder="למשל: תרגיל 2 — Strategy" className={inputClass} />
          </Field>
          <Field label="מועד הגשה (לא חובה)">
            <input name="dueAt" type="datetime-local" className={inputClass} />
          </Field>
          <Field label="קובץ המטלה (PDF, עד 20MB)">
            <input name="file" type="file" accept="application/pdf" required aria-label="קובץ המטלה" className={`${inputClass} file:me-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-indigo-700`} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'מעלה…' : 'פרסום'}
            </Button>
          </div>
          <div className="md:col-span-2">
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      </Card>
    </>
  );
}
