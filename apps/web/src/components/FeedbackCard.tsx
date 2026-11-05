import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Button, Card, ErrorText, inputClass } from './ui';

export const FEEDBACK_LABELS = {
  clear: 'ברור ובקצב טוב',
  too_fast: 'מהיר מדי',
  too_slow: 'איטי מדי',
  unclear: 'החומר לא היה ברור',
} as const;
type Rating = keyof typeof FEEDBACK_LABELS;

/** Student: optional, anonymous feedback once the lecture has ended. Renders nothing when it is not open. */
export default function FeedbackCard({ sessionId, ended }: { sessionId: string; ended: boolean }) {
  const [state, setState] = useState<'hidden' | 'open' | 'sent'>('hidden');
  const [rating, setRating] = useState<Rating | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ended) return setState('hidden');
    api.get<{ open: boolean }>(`/sessions/${sessionId}/feedback/status`).then(
      (s) => setState(s.open ? 'open' : 'hidden'),
      () => setState('hidden'),
    );
  }, [sessionId, ended]);

  if (state === 'hidden') return null;
  if (state === 'sent')
    return (
      <Card className="text-center">
        <p className="font-medium text-emerald-700">תודה על המשוב!</p>
      </Card>
    );

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!rating) return;
    setError('');
    setSending(true);
    try {
      await api.post(`/sessions/${sessionId}/feedback`, { rating, comment: new FormData(e.currentTarget).get('comment') ?? '' });
      setState('sent');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'שגיאת רשת — נסו שוב');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="ring-2 ring-indigo-500">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold">איך היה השיעור?</h2>
          <p className="text-sm text-slate-600">המשוב אנונימי — המרצה רואה רק סיכום של כל התשובות, בלי שמות. לא חובה למלא.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(FEEDBACK_LABELS) as Rating[]).map((r) => (
            <Button key={r} type="button" variant={rating === r ? 'primary' : 'secondary'} onClick={() => setRating(r)} className="py-3 text-base">
              {FEEDBACK_LABELS[r]}
            </Button>
          ))}
        </div>
        {rating && (
          <>
            <textarea name="comment" maxLength={1000} rows={3} placeholder="רוצים לפרט? (לא חובה)" aria-label="פירוט" className={inputClass} />
            <Button type="submit" disabled={sending}>
              שליחת משוב
            </Button>
          </>
        )}
        <button type="button" onClick={() => setState('hidden')} className="text-sm text-slate-500 hover:underline">
          לא עכשיו
        </button>
        <ErrorText>{error}</ErrorText>
      </form>
    </Card>
  );
}

interface Summary {
  responses: number;
  visible: boolean;
  counts: Record<Rating, number> | null;
  comments: { rating: Rating; text: string }[];
}

/** Lecturer: the aggregate only, and only from 3 answers, so no single student can be identified. */
export function FeedbackResults({ sessionId }: { sessionId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const load = useCallback(() => api.get<Summary>(`/sessions/${sessionId}/feedback`).then(setSummary, () => {}), [sessionId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!summary) return null;
  const max = Math.max(1, ...Object.values(summary.counts ?? {}));
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">
          משוב על השיעור <span className="text-sm font-normal text-slate-500">({summary.responses} תשובות · אנונימי)</span>
        </h2>
        <button onClick={load} className="text-sm text-indigo-600 hover:underline">
          רענון
        </button>
      </div>
      {!summary.visible ? (
        <p className="text-sm text-slate-500">התוצאות יוצגו מ-3 תשובות, כדי שאי אפשר יהיה לזהות מי ענה. המשוב פתוח 24 שעות מסיום השיעור.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {(Object.keys(FEEDBACK_LABELS) as Rating[]).map((r) => (
              <li key={r} className="flex items-center gap-3">
                <span className="w-44 shrink-0 text-sm">{FEEDBACK_LABELS[r]}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-indigo-500" style={{ width: `${((summary.counts?.[r] ?? 0) / max) * 100}%` }} />
                </div>
                <span className="w-6 text-end tabular-nums">{summary.counts?.[r] ?? 0}</span>
              </li>
            ))}
          </ul>
          {summary.comments.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3">
              {summary.comments.map((c, i) => (
                <li key={i} className="text-sm">
                  <span className="text-slate-400">{FEEDBACK_LABELS[c.rating]} · </span>
                  <span className="whitespace-pre-wrap">{c.text}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
