import { type ChangeEvent, type FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { MaterialRecord, PracticeRecord } from '../lib/content';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';
import { Button, Card, ErrorText, inputClass } from './ui';

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'שגיאה');
const pickButton = 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium';

/** Lecturer: what students find on the lecture page. Works during and after the lecture. */
export default function LectureContentPanel({ sessionId }: { sessionId: string }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <PracticeManager sessionId={sessionId} />
      <MaterialsManager sessionId={sessionId} />
    </div>
  );
}

function useRun() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
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
  return { busy, error, run };
}

function PracticeManager({ sessionId }: { sessionId: string }) {
  const questions = useLiveRecords<PracticeRecord>('practice_questions', pb.filter('session = {:s}', { s: sessionId }), 'created_at');
  const [text, setText] = useState('');
  const [source, setSource] = useState<'manual' | 'ai'>('manual');
  const [drafts, setDrafts] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const { busy, error, run } = useRun();

  const publish = () =>
    run('save', async () => {
      await api.post(`/sessions/${sessionId}/practice`, { question: text.trim(), source });
      setText('');
      setSource('manual');
    });

  const fromDeck = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.set('deck', file);
    return run('drafts', async () => {
      const result = (await api.upload<{ drafts: string[] }>(`/sessions/${sessionId}/practice/drafts`, form)).drafts;
      setDrafts(result);
      setPicked(new Set(result.keys()));
    });
  };

  const toggle = (i: number) => setPicked((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set([...p, i])));

  const addPicked = () =>
    run('add', async () => {
      for (const i of [...picked].sort((a, b) => a - b)) await api.post(`/sessions/${sessionId}/practice`, { question: drafts[i], source: 'ai' });
      setDrafts([]);
      setPicked(new Set());
    });

  /** Moves one draft into the text box for editing; the rest stay in the list. */
  const edit = (i: number) => {
    setText(drafts[i]);
    setSource('ai');
    setDrafts(drafts.filter((_, j) => j !== i));
    setPicked(new Set());
  };

  const remove = (q: PracticeRecord) =>
    run('remove', async () => {
      if (confirm(`למחוק את השאלה "${q.question}"?`)) await api.del(`/practice/${q.id}`);
    });

  return (
    <Card>
      <h2 className="mb-1 font-semibold">שאלות לתרגול</h2>
      <p className="mb-3 text-xs text-slate-500">שאלות פתוחות לחזרה על החומר. מופיעות בדף השיעור לכל סטודנטי הקורס.</p>

      {questions.length > 0 && (
        <ol className="mb-3 flex flex-col divide-y divide-slate-100">
          {questions.map((q, i) => (
            <li key={q.id} className="flex items-start justify-between gap-2 py-2">
              <span>
                {i + 1}. {q.question}
              </span>
              <button onClick={() => remove(q)} className="shrink-0 text-xs text-red-600 hover:underline">
                מחיקה
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={300} placeholder="שאלה חדשה" aria-label="שאלה לתרגול" className={inputClass} />
        <Button disabled={!!busy || !text.trim()} onClick={publish}>
          פרסום שאלה
        </Button>
        <label className={`${pickButton} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          {busy === 'drafts' ? 'ה-AI קורא את ההרצאה…' : '✨ העלאת ההרצאה (PDF) — ה-AI יציע 8 שאלות'}
          <input type="file" accept="application/pdf,image/*" aria-label="קובץ ההרצאה" className="hidden" onChange={fromDeck} />
        </label>
        <p className="text-xs text-slate-500">עד 50MB. מצגת PowerPoint? שמרו אותה קודם כ-PDF (קובץ ← שמירה בשם ← PDF).</p>
        {drafts.length > 0 && (
          <>
            <ul className="flex flex-col gap-2">
              {drafts.map((d, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="mt-1 h-4 w-4" aria-label={`לבחור את "${d}"`} />
                  <p className="flex-1">{d}</p>
                  <button onClick={() => edit(i)} className="shrink-0 text-xs text-indigo-600 hover:underline">
                    עריכה
                  </button>
                </li>
              ))}
            </ul>
            <Button disabled={!!busy || picked.size === 0} onClick={addPicked}>
              פרסום המסומנות ({picked.size})
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
  const { busy, error, run } = useRun();

  // Picking a file uploads it at once; the file name becomes its title.
  const addFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    return run('file', () => api.upload(`/sessions/${sessionId}/materials`, form));
  };

  const addLink = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    return run('link', async () => {
      await api.post(`/sessions/${sessionId}/materials`, { title: data.get('title'), url: data.get('url') });
      form.reset();
    });
  };

  const remove = (m: MaterialRecord) =>
    run('remove', async () => {
      if (confirm(`למחוק את "${m.title}"?`)) await api.del(`/materials/${m.id}`);
    });

  return (
    <Card>
      <h2 className="mb-1 font-semibold">חומרים לשיעור</h2>
      <p className="mb-3 text-xs text-slate-500">שקפים, קוד, תמונות או קישורים — הסטודנטים מורידים אותם מדף השיעור.</p>

      {materials.length > 0 && (
        <ul className="mb-3 flex flex-col divide-y divide-slate-100">
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

      <label className={`${pickButton} w-full bg-indigo-600 text-white hover:bg-indigo-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        {busy === 'file' ? 'מעלה…' : '📎 העלאת קובץ או תמונה'}
        <input type="file" aria-label="קובץ" className="hidden" onChange={addFile} />
      </label>

      <form onSubmit={addLink} className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
        <input name="url" type="url" required dir="ltr" placeholder="https://…" aria-label="קישור" className={inputClass} />
        <div className="flex gap-2">
          <input name="title" maxLength={200} placeholder="כותרת (לא חובה)" className={`${inputClass} flex-1`} />
          <Button type="submit" variant="secondary" disabled={!!busy}>
            הוספת קישור
          </Button>
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
