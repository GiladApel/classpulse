import type { RecordModel } from 'pocketbase';
import { type ChangeEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { pb } from '../lib/pb';
import { isRunning, useCountdown, useLatestChallenge, useProtectedFileUrl } from '../lib/useChallenge';
import { Button, Card, ErrorText } from './ui';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Verdict = 'pending' | 'ok' | 'empty_seat' | 'collision' | 'no_response';

const VERDICT: Record<Verdict, { label: string; dot: string }> = {
  pending: { label: 'ממתין', dot: 'bg-sky-400' },
  ok: { label: 'תקין', dot: 'bg-emerald-500' },
  empty_seat: { label: 'מקום ריק', dot: 'bg-red-500' },
  collision: { label: 'התנגשות', dot: 'bg-orange-500' },
  no_response: { label: 'לא הגיב', dot: 'bg-slate-400' },
};

interface Props {
  sessionId: string;
  active: boolean;
  presentCount: number;
}

/** Headcount photo → AI count → optional challenge → live heatmap of taps on the clear photo. */
export default function VerificationPanel({ sessionId, active, presentCount }: Props) {
  const [headcount, setHeadcount] = useState<RecordModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const challenge = useLatestChallenge(sessionId);
  const left = useCountdown(challenge?.expires_at);
  const running = isRunning(challenge, left);
  const responses = useResponses(challenge?.id);
  const photoUrl = useProtectedFileUrl(headcount, 'photo');

  useEffect(() => {
    pb.collection('headcounts')
      .getList(1, 1, { filter: pb.filter('session = {:s}', { s: sessionId }), sort: '-created' })
      .then((r) => setHeadcount(r.items[0] ?? null))
      .catch(() => {});
  }, [sessionId]);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.set('photo', file);
    return run(async () => {
      const res = await api.upload<{ headcount: { id: string } }>(`/sessions/${sessionId}/headcounts`, form);
      setHeadcount(await pb.collection('headcounts').getOne(res.headcount.id));
    });
  };

  const launch = (type: 'rollcall' | 'visual_ping') =>
    run(() => api.post(`/sessions/${sessionId}/challenges`, { type, headcountId: type === 'visual_ping' ? headcount?.id : undefined }));

  const closeNow = () => challenge && run(() => api.post(`/challenges/${challenge.id}/close`));

  const people: number | null = headcount && headcount.people_count >= 0 ? headcount.people_count : null;
  const boxes: Box[] = headcount?.boxes ?? [];
  const mismatch = people !== null && presentCount > people + Math.max(1, Math.round(people * 0.1));
  const showTaps = challenge?.type === 'visual_ping' && challenge.headcount === headcount?.id;
  const counts = responses.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] ?? 0) + 1 }), {});

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">אימות נוכחות</h2>
        {active && (
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            📷 {busy ? 'מנתח…' : 'צילום כיתה'}
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
          </label>
        )}
      </div>

      {headcount && (
        <div className={`mb-3 rounded-xl px-4 py-3 ${people === null ? 'bg-slate-100' : mismatch ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {people === null ? (
            <span>לא הצלחנו לספור אנשים בתמונה — אפשר להריץ Roll-call.</span>
          ) : (
            <span className="text-lg">
              <b className="tabular-nums">~{people}</b> בתמונה · <b className="tabular-nums">{presentCount}</b> רשומים
              {mismatch ? ' — ייתכנו סימוני נוכחות מרחוק ⚠' : ' — תואם ✓'}
              <span className="ms-2 text-sm opacity-70">(ביטחון {Math.round(headcount.confidence * 100)}%)</span>
            </span>
          )}
        </div>
      )}

      {active && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {running ? (
            <>
              <span className="rounded-full bg-indigo-100 px-3 py-1.5 font-medium text-indigo-800">
                {challenge.type === 'rollcall' ? 'Roll-call' : 'בדיקה ויזואלית'} פעילה · {left} ש׳ · {responses.length} תגובות
              </span>
              <Button variant="secondary" onClick={closeNow} disabled={busy}>
                סיום עכשיו
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => launch('visual_ping')} disabled={busy || people === null}>
                בדיקה ויזואלית (45 ש׳)
              </Button>
              <Button variant="secondary" onClick={() => launch('rollcall')} disabled={busy}>
                Roll-call (30 ש׳)
              </Button>
            </>
          )}
        </div>
      )}
      <ErrorText>{error}</ErrorText>

      {headcount && photoUrl && (
        <div className="relative mt-2 overflow-hidden rounded-xl">
          <img src={photoUrl} alt="תמונת הכיתה" className="block w-full" />
          {boxes.map((b, i) => (
            <span
              key={i}
              className="pointer-events-none absolute rounded border-2 border-white/70"
              style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
            />
          ))}
          {showTaps &&
            responses
              .filter((r) => r.x >= 0 && r.y >= 0)
              .map((r) => (
                <span key={r.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}>
                  <span className={`absolute -inset-5 rounded-full opacity-30 blur-md ${VERDICT[r.verdict as Verdict].dot}`} />
                  <span className={`relative block h-4 w-4 rounded-full border-2 border-white ${VERDICT[r.verdict as Verdict].dot}`} title={r.student_number} />
                </span>
              ))}
        </div>
      )}

      {challenge && challenge.status === 'closed' && responses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <span className="text-slate-500">תוצאות הבדיקה האחרונה:</span>
          {(Object.keys(VERDICT) as Verdict[])
            .filter((v) => counts[v])
            .map((v) => (
              <span key={v} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${VERDICT[v].dot}`} /> {VERDICT[v].label}: {counts[v]}
              </span>
            ))}
          {(counts.empty_seat || counts.collision || counts.no_response) && <span className="text-amber-700">· המסומנים מופיעים בטבלה לבדיקה</span>}
        </div>
      )}
    </Card>
  );
}

function useResponses(challengeId: string | undefined): RecordModel[] {
  const [list, setList] = useState<RecordModel[]>([]);
  useEffect(() => {
    setList([]);
    if (!challengeId) return;
    let cancelled = false;
    const col = pb.collection('challenge_responses');
    const filter = pb.filter('challenge = {:c}', { c: challengeId });
    const unsubscribe = col.subscribe(
      '*',
      ({ action, record }) =>
        setList((prev) => (action === 'delete' ? prev.filter((r) => r.id !== record.id) : [...prev.filter((r) => r.id !== record.id), record])),
      { filter },
    );
    col.getFullList({ filter }).then((items) => !cancelled && setList(items)).catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe.then((fn) => fn()).catch(() => {});
    };
  }, [challengeId]);
  return list;
}
