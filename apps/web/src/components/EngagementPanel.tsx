import type { RecordModel } from 'pocketbase';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { pb } from '../lib/pb';
import { currentPoll, type PollRecord, type PostRecord, tally, useLiveRecords, useTick } from '../lib/useLiveRecords';
import PollBars from './PollBars';
import { Button, Card, ErrorText, inputClass } from './ui';

interface Draft {
  question: string;
  options: string[];
  correctIndex: number | null;
}

interface Theme {
  title: string;
  summary: string;
  postIds: string[];
}

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'שגיאה');

export default function EngagementPanel({ sessionId, active }: { sessionId: string; active: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        {active && <ConfusionCard sessionId={sessionId} />}
        <PollManager sessionId={sessionId} active={active} />
      </div>
      <FeedBoard sessionId={sessionId} />
    </div>
  );
}

function ConfusionCard({ sessionId }: { sessionId: string }) {
  const signals = useLiveRecords('lost_signals', pb.filter('session = {:s}', { s: sessionId }));
  const [level, setLevel] = useState({ lost: 0, present: 0, ratio: 0, windowSec: 120 });

  // Server owns the rolling-window logic; refetch on every new signal and every 10 s so old signals decay.
  useEffect(() => {
    let stopped = false;
    const load = () => api.get<typeof level>(`/sessions/${sessionId}/confusion`).then((l) => !stopped && setLevel(l), () => {});
    load();
    const id = setInterval(load, 10_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId, signals.length]);

  const pct = Math.round(level.ratio * 100);
  const tone = pct >= 30 ? 'bg-red-500' : pct >= 15 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">מד בלבול</h2>
        <span className="text-sm text-slate-500">2 הדקות האחרונות</span>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full transition-all duration-700 ${tone}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <p className="mt-2 text-sm text-slate-700">
        <span className="text-2xl font-bold tabular-nums">{level.lost}</span> מתוך {level.present} לחצו "הלכתי לאיבוד"
        {pct >= 30 && <span className="ms-2 font-semibold text-red-600">— כדאי לעצור ולהסביר שוב</span>}
      </p>
    </Card>
  );
}

function PollManager({ sessionId, active }: { sessionId: string; active: boolean }) {
  useTick(5000);
  const polls = useLiveRecords<PollRecord>('polls', pb.filter('session = {:s}', { s: sessionId }));
  const shown = currentPoll(polls, 3600);
  const votes = useLiveRecords<RecordModel & { option_index: number }>('poll_votes', pb.filter('poll = {:p}', { p: shown?.id ?? '' }), '', !!shown);
  // correct_index is hidden from PB reads; remember it from the API response of the poll we launched.
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [question, setQuestion] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
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

  const launch = (body: Record<string, unknown>) =>
    run('launch', async () => {
      const p = await api.post<{ id: string; correctIndex: number | null }>(`/sessions/${sessionId}/polls`, { ...body, open: true });
      setAnswers((a) => ({ ...a, [p.id]: p.correctIndex }));
      setEditing(null);
      setDrafts([]);
      setQuestion('');
    });

  const template = (kind: string, fallback: string) => launch({ template: kind, question: question.trim() || fallback });

  const fromSlide = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.set('slide', file);
    if (question.trim()) form.set('text', question.trim());
    return run('drafts', async () => setDrafts((await api.upload<{ drafts: Draft[] }>('/polls/drafts', form)).drafts));
  };

  const fromText = () => {
    const form = new FormData();
    form.set('text', question.trim());
    return run('drafts', async () => setDrafts((await api.upload<{ drafts: Draft[] }>('/polls/drafts', form)).drafts));
  };

  const close = (id: string) => run('close', () => api.post(`/polls/${id}/close`));

  const counts = shown ? (shown.status === 'closed' && shown.results ? shown.results.counts : tally(shown.options, votes)) : [];
  const correct = shown ? (shown.status === 'closed' ? shown.answer_index : (answers[shown.id] ?? -1)) : -1;

  return (
    <Card>
      <h2 className="mb-3 font-semibold">סקר מהיר</h2>

      {shown && (
        <div className="mb-4 rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-medium">{shown.question}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${shown.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
              {shown.status === 'open' ? `פתוח · ${votes.length} הצבעות` : 'נסגר'}
            </span>
          </div>
          {/* While open, the lecturer sees the answer marked; students and the projector see it only after close. */}
          <PollBars options={shown.options} counts={counts} correctIndex={correct ?? -1} />
          {shown.status === 'open' && (
            <Button className="mt-3 w-full" onClick={() => close(shown.id)} disabled={busy === 'close'}>
              סגירה וחשיפת התשובה
            </Button>
          )}
        </div>
      )}

      {active && !editing && (
        <div className="flex flex-col gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="שאלה (או טקסט מהשקף ליצירת שאלה עם AI)" className={inputClass} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!!busy} onClick={() => template('yes_no', 'ברור עד עכשיו?')}>
              כן / לא
            </Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => template('abcd', 'מה התשובה?')}>
              A–D
            </Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => template('scale5', 'כמה ברור החומר? (1–5)')}>
              1–5
            </Button>
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
              ✨ שאלה משקף
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={fromSlide} />
            </label>
            <Button variant="ghost" disabled={!!busy || question.trim().length < 20} onClick={fromText} title="לפחות 20 תווים של טקסט מהשקף">
              ✨ מהטקסט
            </Button>
          </div>
          {busy === 'drafts' && <p className="text-sm text-slate-500">ה-AI מכין 3 שאלות…</p>}
        </div>
      )}

      {drafts.length > 0 && !editing && (
        <ul className="mt-3 flex flex-col gap-2">
          {drafts.map((d, i) => (
            <li key={i}>
              <button onClick={() => setEditing(structuredClone(d))} className="w-full rounded-xl border border-slate-200 p-3 text-start hover:border-indigo-400 hover:bg-indigo-50">
                <p className="font-medium">{d.question}</p>
                <p className="mt-1 text-xs text-slate-500">{d.options.map((o, j) => (j === d.correctIndex ? `✓${o}` : o)).join(' · ')}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="flex flex-col gap-2">
          <textarea value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} rows={2} maxLength={300} className={inputClass} />
          {editing.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                checked={editing.correctIndex === i}
                onChange={() => setEditing({ ...editing, correctIndex: i })}
                className="h-4 w-4"
                aria-label="תשובה נכונה"
              />
              <input
                value={o}
                maxLength={120}
                onChange={(e) => setEditing({ ...editing, options: editing.options.map((x, j) => (j === i ? e.target.value : x)) })}
                className={`${inputClass} flex-1`}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!!busy} onClick={() => launch({ ...editing, source: 'ai' })}>
              פתיחת הסקר
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              חזרה
            </Button>
          </div>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function FeedBoard({ sessionId }: { sessionId: string }) {
  const posts = useLiveRecords<PostRecord>('feed_posts', pb.filter('session = {:s}', { s: sessionId }));
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  const sorted = useMemo(() => [...posts].sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.posted_at.localeCompare(b.posted_at)), [posts]);
  const open = posts.filter((p) => !p.answered).length;

  const setAnswered = (p: PostRecord) => api.post(`/posts/${p.id}/answered`, { answered: !p.answered }).catch((e) => setError(message(e)));

  const cluster = async () => {
    setError('');
    setBusy(true);
    try {
      setThemes((await api.post<{ themes: Theme[] }>(`/sessions/${sessionId}/themes`)).themes);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">
          שאלות מהכיתה <span className="text-sm font-normal text-slate-500">({open} פתוחות)</span>
        </h2>
        <Button variant="secondary" disabled={busy || open < 2} onClick={cluster}>
          {busy ? 'מקבץ…' : '✨ קיבוץ לנושאים'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>

      {themes && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-indigo-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-indigo-900">נושאים חוזרים</p>
            <button onClick={() => setThemes(null)} className="text-xs text-indigo-700 hover:underline">
              סגירה
            </button>
          </div>
          {themes.map((t) => (
            <div key={t.title}>
              <p className="font-medium">
                {t.title} <span className="text-xs text-slate-500">({t.postIds.reduce((n, id) => n + 1 + (byId.get(id)?.votes ?? 0), 0)} סטודנטים)</span>
              </p>
              {t.summary && <p className="text-sm text-slate-700">{t.summary}</p>}
            </div>
          ))}
        </div>
      )}

      <ul className="flex max-h-[32rem] flex-col divide-y divide-slate-100 overflow-y-auto">
        {sorted.map((p) => (
          <li key={p.id} className={`flex items-start gap-3 py-2 ${p.answered ? 'opacity-50' : ''}`}>
            <span className="min-w-10 rounded-lg bg-slate-100 px-2 py-1 text-center text-sm tabular-nums">▲{p.votes}</span>
            <div className="flex-1">
              <p className="whitespace-pre-wrap break-words">{p.text}</p>
              <p className="text-xs text-slate-400">{p.anonymous ? 'אנונימי' : p.display_name}</p>
            </div>
            <button onClick={() => setAnswered(p)} className="shrink-0 text-xs text-emerald-700 hover:underline">
              {p.answered ? 'בטל' : 'נענה ✓'}
            </button>
          </li>
        ))}
        {sorted.length === 0 && <li className="py-6 text-center text-sm text-slate-400">עוד אין שאלות</li>}
      </ul>
    </Card>
  );
}
