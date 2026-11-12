import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, ErrorText, Field, inputClass } from './ui';
import { api, ApiError } from '../lib/api';
import type { AssignmentRecord } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';

interface Row {
  criterion: string;
  weight: number;
  description: string;
}

const STARTER: Row[] = [
  { criterion: 'נכונות', weight: 3, description: 'הפתרון עונה על הדרישות' },
  { criterion: 'עיצוב ו-OOP', weight: 2, description: 'הפרדת אחריות, שימוש נכון בתבניות' },
  { criterion: 'בדיקות', weight: 1, description: 'בדיקות יחידה כולל מקרי קצה' },
];

/** Lecturer: a course's assignments, and a form to create one with a weighted rubric. */
export default function AssignmentManager({ courseId: id }: { courseId: string }) {
  const assignments = useLiveRecords<AssignmentRecord>('assignments', pb.filter('course = {:c}', { c: id }), '-created_at');
  const [rubric, setRubric] = useState<Row[]>(STARTER);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError('');
    setBusy(true);
    try {
      const due = f.get('dueAt') as string;
      await api.post(`/courses/${id}/assignments`, {
        title: f.get('title'),
        description: f.get('description'),
        rubric,
        dueAt: due ? new Date(due).toISOString() : undefined,
      });
      form.reset();
      setRubric(STARTER);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  const setRow = (i: number, patch: Partial<Row>) => setRubric(rubric.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const sorted = [...assignments].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <Card>
        <ul className="divide-y divide-slate-100">
          {sorted.map((a) => (
            <li key={a.id}>
              <Link to={`/dash/assignment/${a.id}`} className="flex items-center justify-between py-3 hover:text-indigo-700">
                <span className="font-medium">{a.title}</span>
                <span className="text-sm text-slate-500">{a.due_at ? `עד ${parseDate(a.due_at).toLocaleDateString('he-IL')}` : 'ללא מועד'}</span>
              </Link>
            </li>
          ))}
          {assignments.length === 0 && <li className="py-3 text-slate-500">עוד אין מטלות.</li>}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">מטלה חדשה</h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          <Field label="כותרת">
            <input name="title" required maxLength={200} className={inputClass} />
          </Field>
          <Field label="תיאור (ה-AI בודק לפיו ולפי המחוון)">
            <textarea name="description" rows={4} maxLength={5000} className={inputClass} />
          </Field>
          <Field label="מועד הגשה">
            <input name="dueAt" type="datetime-local" className={inputClass} />
          </Field>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">מחוון</p>
            <div className="flex flex-col gap-2">
              {rubric.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_5rem_auto] gap-2 md:grid-cols-[1fr_5rem_2fr_auto]">
                  <input value={r.criterion} required maxLength={120} placeholder="קריטריון" onChange={(e) => setRow(i, { criterion: e.target.value })} className={inputClass} />
                  <input type="number" min={1} max={100} value={r.weight} aria-label="משקל" onChange={(e) => setRow(i, { weight: Number(e.target.value) })} className={inputClass} />
                  <input value={r.description} maxLength={500} placeholder="מה בודקים" onChange={(e) => setRow(i, { description: e.target.value })} className={`${inputClass} col-span-3 md:col-span-1`} />
                  <button type="button" onClick={() => setRubric(rubric.filter((_, j) => j !== i))} disabled={rubric.length === 1} className="row-start-1 text-sm text-red-600 disabled:opacity-30 md:row-start-auto" aria-label="מחיקה">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {rubric.length < 10 && (
              <Button type="button" variant="ghost" className="mt-1" onClick={() => setRubric([...rubric, { criterion: '', weight: 1, description: '' }])}>
                + קריטריון
              </Button>
            )}
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy}>
            יצירת מטלה
          </Button>
        </form>
      </Card>
    </>
  );
}
