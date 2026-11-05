import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { MaterialRecord } from '../lib/content';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';
import { Button, Card, ErrorText, inputClass } from './ui';

interface Draft {
  question: string;
  options: string[];
  correctIndex: number | null;
}

interface PracticeDto extends Draft {
  id: string;
  correctIndex: number;
  source: 'manual' | 'ai';
}

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'שגיאה');
const EMPTY: Draft = { question: '', options: ['', '', '', ''], correctIndex: null };

/** Lecturer: what students find on the lecture page. Works during and after the lecture. */
export default function LectureContentPanel({ sessionId }: { sessionId: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PracticeManager sessionId={sessionId} />
      <MaterialsManager sessionId={sessionId} />
    </div>
  );
}

function PracticeManager({ sessionId }: { sessionId: string }) {
  const [questions, setQuestions] = useState<PracticeDto[]>([]);
  const [editing, setEditing] = useState<Draft & { source: 'manual' | 'ai' }>({ ...EMPTY, source: 'manual' });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // correct_index is hidden from PocketBase reads, so the lecturer's list comes from the API.
  const load = useCallback(() => api.get<{ questions: PracticeDto[] }>(`/sessions/${sessionId}/practice`).then((r) => setQuestions(r.questions)), [sessionId]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError('');
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  };

  const save = () =>
    run('save', async () => {
      const options = editing.options.map((o) => o.trim()).filter(Boolean);
      const kept = editing.correctIndex === null ? -1 : editing.options.slice(0, editing.correctIndex).filter((o) => o.trim()).length;
      if (editing.correctIndex === null || !editing.options[editing.correctIndex]?.trim()) throw new ApiError(400, 'NO_ANSWER', 'סמנו את התשובה הנכונה');
      await api.post(`/sessions/${sessionId}/practice`, { question: editing.question, options, correctIndex: kept, source: editing.source });
      setEditing({ ...EMPTY, source: 'manual' });
      await load();
    });

  const fromDeck = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.set('deck', file);
    return run('drafts', async () => {
      const result = (await api.upload<{ drafts: Draft[] }>(`/sessions/${sessionId}/practice/drafts`, form)).drafts;
      setDrafts(result);
      setPicked(new Set(result.keys()));
    });
  };

  const toggle = (i: number) => setPicked((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set([...p, i])));

  const addPicked = () =>
    run('add', async () => {
      for (const i of [...picked].sort((a, b) => a - b)) await api.post(`/sessions/${sessionId}/practice`, { ...drafts[i], source: 'ai' });
      setDrafts([]);
      setPicked(new Set());
      await load();
    });

  /** Moves one draft into the form for editing; the rest stay in the list. */
  const edit = (i: number) => {
    const d = drafts[i];
    const options = [...d.options, '', '', '', ''].slice(0, Math.max(4, d.options.length));
    setEditing({ question: d.question, options, correctIndex: d.correctIndex, source: 'ai' });
    setDrafts(drafts.filter((_, j) => j !== i));
    setPicked(new Set());
  };

  const remove = (q: PracticeDto) =>
    run('remove', async () => {
      if (!confirm(`למחוק את השאלה "${q.question}"?`)) return;
      await api.del(`/practice/${q.id}`);
      await load();
    });

  return (
    <Card>
      <h2 className="mb-1 font-semibold">שאלות לתרגול</h2>
      <p className="mb-3 text-xs text-slate-500">מופיעות בדף השיעור לכל סטודנטי הקורס. כל סטודנט עונה פעם אחת ורואה את התשובה הנכונה.</p>

      {questions.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {questions.map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-3">
              <div>
                <p className="font-medium">{q.question}</p>
                <p className="mt-1 text-xs text-slate-500">{q.options.map((o, j) => (j === q.correctIndex ? `✓${o}` : o)).join(' · ')}</p>
              </div>
              <button onClick={() => remove(q)} className="shrink-0 text-xs text-red-600 hover:underline">
                מחיקה
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          value={editing.question}
          onChange={(e) => setEditing({ ...editing, question: e.target.value })}
          rows={2}
          maxLength={300}
          placeholder="שאלה חדשה"
          aria-label="שאלה לתרגול"
          className={inputClass}
        />
        {editing.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`practice-correct-${sessionId}`}
              checked={editing.correctIndex === i}
              onChange={() => setEditing({ ...editing, correctIndex: i })}
              className="h-4 w-4"
              aria-label={`תשובה ${i + 1} נכונה`}
            />
            <input
              value={o}
              maxLength={120}
              placeholder={`תשובה ${i + 1}${i >= 2 ? ' (לא חובה)' : ''}`}
              onChange={(e) => setEditing({ ...editing, options: editing.options.map((x, j) => (j === i ? e.target.value : x)) })}
              className={`${inputClass} flex-1`}
            />
          </div>
        ))}
        <Button disabled={!!busy || !editing.question.trim()} onClick={save}>
          הוספת שאלה
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
        <label
          className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-800 hover:bg-slate-50 ${busy ? 'pointer-events-none opacity-50' : ''}`}
        >
          {busy === 'drafts' ? 'ה-AI קורא את ההרצאה…' : '✨ העלאת ההרצאה (PDF) — ה-AI יציע 8 שאלות'}
          <input type="file" accept="application/pdf,image/*" aria-label="קובץ ההרצאה" className="hidden" onChange={fromDeck} />
        </label>
        <p className="text-xs text-slate-500">עד 50MB. מצגת PowerPoint? שמרו אותה קודם כ-PDF (קובץ ← שמירה בשם ← PDF).</p>
        {drafts.length > 0 && (
          <>
            <ul className="flex flex-col gap-2">
              {drafts.map((d, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="mt-1 h-4 w-4" aria-label={`לבחור את "${d.question}"`} />
                  <div className="flex-1">
                    <p className="font-medium">{d.question}</p>
                    <p className="mt-1 text-xs text-slate-500">{d.options.map((o, j) => (j === d.correctIndex ? `✓${o}` : o)).join(' · ')}</p>
                  </div>
                  <button onClick={() => edit(i)} className="shrink-0 text-xs text-indigo-600 hover:underline">
                    עריכה
                  </button>
                </li>
              ))}
            </ul>
            <Button disabled={!!busy || picked.size === 0} onClick={addPicked}>
              הוספת המסומנות ({picked.size})
            </Button>
          </>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function MaterialsManager({ sessionId }: { sessionId: string }) {
  const materials = useLiveRecords<MaterialRecord>('materials', pb.filter('session = {:s}', { s: sessionId }), 'added_at');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const addFile = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (!(data.get('file') instanceof File) || !(data.get('file') as File).size) return setError('בחרו קובץ');
    return run(async () => {
      await api.upload(`/sessions/${sessionId}/materials`, data);
      form.reset();
    });
  };

  const addLink = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    return run(async () => {
      await api.post(`/sessions/${sessionId}/materials`, { title: data.get('title'), url: data.get('url') });
      form.reset();
    });
  };

  const remove = (m: MaterialRecord) =>
    run(async () => {
      if (confirm(`למחוק את "${m.title}"?`)) await api.del(`/materials/${m.id}`);
    });

  return (
    <Card>
      <h2 className="mb-1 font-semibold">חומרים לשיעור</h2>
      <p className="mb-3 text-xs text-slate-500">שקפים, קוד או קישורים — הסטודנטים מורידים אותם מדף השיעור.</p>

      {materials.length > 0 && (
        <ul className="mb-4 flex flex-col divide-y divide-slate-100">
          {materials.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {m.kind === 'link' ? '🔗' : '📄'} {m.title}
              </span>
              <button onClick={() => remove(m)} className="text-xs text-red-600 hover:underline">
                מחיקה
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addFile} className="flex flex-col gap-2">
        <input name="file" type="file" aria-label="קובץ" className="text-sm" />
        <div className="flex gap-2">
          <input name="title" maxLength={200} placeholder="כותרת (לא חובה)" className={`${inputClass} flex-1`} />
          <Button type="submit" disabled={busy}>
            העלאה
          </Button>
        </div>
      </form>

      <form onSubmit={addLink} className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
        <input name="url" type="url" required dir="ltr" placeholder="https://…" aria-label="קישור" className={inputClass} />
        <div className="flex gap-2">
          <input name="title" maxLength={200} placeholder="כותרת (לא חובה)" className={`${inputClass} flex-1`} />
          <Button type="submit" variant="secondary" disabled={busy}>
            הוספת קישור
          </Button>
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
