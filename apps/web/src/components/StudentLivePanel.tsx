import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { pb } from '../lib/pb';
import { useCountdown } from '../lib/useChallenge';
import { currentPoll, type PollRecord, type PostRecord, useLiveRecords, useTick } from '../lib/useLiveRecords';
import FeedbackCard from './FeedbackCard';
import PollBars from './PollBars';
import { Button, Card, ErrorText, inputClass } from './ui';

const message = (e: unknown) => (e instanceof ApiError && e.status < 500 ? e.message : 'שגיאת רשת — נסו שוב');

export default function StudentLivePanel({ sessionId, active }: { sessionId: string; active: boolean }) {
  return (
    <div className="flex w-full flex-col gap-4 text-start">
      <FeedbackCard sessionId={sessionId} ended={!active} />
      <PollCard sessionId={sessionId} />
      {active && <LostButton sessionId={sessionId} />}
      <Feed sessionId={sessionId} canPost />
    </div>
  );
}

function LostButton({ sessionId }: { sessionId: string }) {
  const [until, setUntil] = useState<string>();
  const [error, setError] = useState('');
  const [note, setNote] = useState<'open' | 'sending' | 'sent' | 'closed'>('closed');
  const left = useCountdown(until);

  const signal = async () => {
    setError('');
    try {
      const r = await api.post<{ accepted: boolean; retryInSec: number }>(`/sessions/${sessionId}/lost`);
      setUntil(new Date(Date.now() + r.retryInSec * 1000).toISOString());
      setNote('open');
    } catch (e) {
      setError(message(e));
    }
  };

  // The tap says *when* students got lost; this optional note says *what*, as an anonymous post in the questions feed.
  const sendNote = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = String(new FormData(e.currentTarget).get('text') ?? '').trim();
    if (!text) return;
    setError('');
    setNote('sending');
    try {
      await api.post(`/sessions/${sessionId}/posts`, { text, anonymous: true });
      setNote('sent');
    } catch (err) {
      setNote('open');
      setError(message(err));
    }
  };

  return (
    <Card className="flex flex-col items-center gap-2 text-center">
      <button
        onClick={signal}
        disabled={left > 0}
        className="w-full rounded-2xl bg-amber-400 py-5 text-2xl font-bold text-amber-950 shadow-sm transition active:scale-95 disabled:bg-amber-100 disabled:text-amber-700"
      >
        {left > 0 ? `המרצה קיבל/ה את זה ✓ (${left})` : '🤯 הלכתי לאיבוד'}
      </button>
      <p className="text-xs text-slate-500">אנונימי לגמרי — המרצה רואה רק כמה סטודנטים לחצו.</p>
      {(note === 'open' || note === 'sending') && (
        <form onSubmit={sendNote} className="flex w-full flex-col gap-2 text-start">
          <label className="text-sm font-medium text-slate-700" htmlFor="lost-note">
            רוצים לכתוב מה לא ברור? (לא חובה)
          </label>
          <textarea id="lost-note" name="text" maxLength={500} rows={2} autoFocus placeholder="למשל: לא הבנתי את הדוגמה האחרונה" className={inputClass} />
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setNote('closed')} className="text-sm text-slate-500 hover:underline">
              לא תודה
            </button>
            <Button type="submit" disabled={note === 'sending'}>
              שליחה כשאלה אנונימית
            </Button>
          </div>
        </form>
      )}
      {note === 'sent' && <p className="text-sm text-emerald-700">נוסף לשאלות ✓ חברים לכיתה יכולים להצביע עליה</p>}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function PollCard({ sessionId }: { sessionId: string }) {
  useTick(5000);
  const userId = pb.authStore.record?.id ?? '';
  const polls = useLiveRecords<PollRecord>('polls', pb.filter('session = {:s}', { s: sessionId }));
  const poll = currentPoll(polls, 120);
  const myVotes = useLiveRecords<PollRecord & { option_index: number }>(
    'poll_votes',
    pb.filter('poll = {:p} && student = {:u}', { p: poll?.id ?? '', u: userId }),
    '',
    !!poll,
  );
  const [pending, setPending] = useState(-1);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const mine = myVotes[0]?.option_index ?? pending;

  // FR-PL-03: the phone "switches" to a newly opened poll.
  useEffect(() => {
    setPending(-1);
    setError('');
    if (poll?.status === 'open') {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      navigator.vibrate?.(150);
    }
  }, [poll?.id, poll?.status]);

  if (!poll) return null;

  const vote = async (i: number) => {
    setError('');
    setPending(i);
    try {
      await api.post(`/polls/${poll.id}/votes`, { optionIndex: i });
    } catch (e) {
      setPending(-1);
      setError(message(e));
    }
  };

  return (
    <div ref={ref}>
      <Card className={poll.status === 'open' ? 'ring-2 ring-indigo-500' : ''}>
        <p className="mb-1 text-xs font-semibold text-indigo-600">{poll.status === 'open' ? 'סקר פתוח' : 'תוצאות הסקר'}</p>
        <h2 className="mb-3 text-lg font-bold">{poll.question}</h2>
        {poll.status === 'open' ? (
          <div className="flex flex-col gap-2">
            {poll.options.map((o, i) => (
              <Button key={i} variant={mine === i ? 'primary' : 'secondary'} disabled={mine >= 0} onClick={() => vote(i)} className="justify-start py-3 text-start text-base">
                {o}
              </Button>
            ))}
            {mine >= 0 && <p className="text-sm text-emerald-700">ההצבעה נקלטה ✓ התוצאות יוצגו כשהסקר ייסגר</p>}
          </div>
        ) : (
          <PollBars options={poll.options} counts={poll.results?.counts ?? poll.options.map(() => 0)} correctIndex={poll.answer_index} mine={mine} />
        )}
        <ErrorText>{error}</ErrorText>
      </Card>
    </div>
  );
}

/** Questions with the lecturer's answers. Only students checked in to this lecture may post or upvote (`canPost`). */
export function Feed({ sessionId, canPost }: { sessionId: string; canPost: boolean }) {
  const userId = pb.authStore.record?.id ?? '';
  const posts = useLiveRecords<PostRecord>('feed_posts', pb.filter('session = {:s}', { s: sessionId }));
  const myVotes = useLiveRecords<PostRecord & { post: string }>('post_votes', pb.filter('voter = {:u} && post.session = {:s}', { u: userId, s: sessionId }));
  const voted = useMemo(() => new Set(myVotes.map((v) => v.post)), [myVotes]);
  const [anonymous, setAnonymous] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const sorted = useMemo(() => [...posts].sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.posted_at.localeCompare(b.posted_at)), [posts]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const text = new FormData(form).get('text');
    setError('');
    setSending(true);
    try {
      await api.post(`/sessions/${sessionId}/posts`, { text, anonymous });
      form.reset();
    } catch (err) {
      setError(message(err));
    } finally {
      setSending(false);
    }
  };

  const upvote = async (id: string) => {
    setError('');
    try {
      await api.post(`/posts/${id}/votes`);
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <Card>
      <h2 className="mb-3 font-semibold">שאלות והערות</h2>
      {canPost && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <textarea name="text" required maxLength={500} rows={2} placeholder="שאלה, הערה או הצעה למרצה…" className={inputClass} />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4" />
              אנונימי
            </label>
            <Button type="submit" disabled={sending}>
              שליחה
            </Button>
          </div>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
      <ul className="mt-3 flex flex-col divide-y divide-slate-100">
        {sorted.map((p) => (
          <li key={p.id} className={`flex items-start gap-3 py-2 ${p.answered ? 'opacity-50' : ''}`}>
            <button
              onClick={() => upvote(p.id)}
              disabled={!canPost || voted.has(p.id)}
              aria-label="גם אני"
              className="flex min-w-12 flex-col items-center rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums enabled:hover:bg-indigo-50 disabled:border-indigo-200 disabled:bg-indigo-50 disabled:text-indigo-700"
            >
              ▲<span>{p.votes}</span>
            </button>
            <div className="flex-1">
              <p className="whitespace-pre-wrap break-words">{p.text}</p>
              <p className="text-xs text-slate-400">
                {p.anonymous ? 'אנונימי' : p.display_name}
                {p.answered && ' · נענה ✓'}
              </p>
              {p.answer && (
                <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <span className="font-semibold">תשובת המרצה: </span>
                  {p.answer}
                </p>
              )}
            </div>
          </li>
        ))}
        {sorted.length === 0 && <li className="py-3 text-center text-sm text-slate-400">{canPost ? 'עוד אין שאלות. תהיו הראשונים!' : 'לא נשאלו שאלות בשיעור הזה.'}</li>}
      </ul>
    </Card>
  );
}
