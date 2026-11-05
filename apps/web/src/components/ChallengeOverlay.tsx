import { type MouseEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { pb } from '../lib/pb';
import { isRunning, useCountdown, useLatestChallenge, useProtectedFileUrl } from '../lib/useChallenge';

type TapState = { kind: 'idle' } | { kind: 'sending'; x: number; y: number } | { kind: 'done'; x?: number; y?: number } | { kind: 'error'; message: string };

/** Full-screen prompt on a checked-in student's phone while a challenge runs. */
export default function ChallengeOverlay({ sessionId }: { sessionId: string }) {
  const challenge = useLatestChallenge(sessionId);
  const left = useCountdown(challenge?.expires_at);
  const imageUrl = useProtectedFileUrl(challenge?.type === 'visual_ping' ? challenge : null, 'image');
  const [state, setState] = useState<TapState>({ kind: 'idle' });

  // Reset per challenge, and restore "already answered" after a page reload.
  useEffect(() => {
    setState({ kind: 'idle' });
    if (!challenge) return;
    pb.collection('challenge_responses')
      .getList(1, 1, { filter: pb.filter('challenge = {:c} && student = {:u}', { c: challenge.id, u: pb.authStore.record?.id ?? '' }) })
      .then((r) => r.items[0] && setState({ kind: 'done', x: r.items[0].x, y: r.items[0].y }))
      .catch(() => {});
  }, [challenge?.id]);

  if (!isRunning(challenge, left)) return null;

  const tap = async (e: MouseEvent<HTMLImageElement>) => {
    if (state.kind !== 'idle' && state.kind !== 'error') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setState({ kind: 'sending', x, y });
    try {
      await api.post(`/challenges/${challenge.id}/responses`, { tap: { x, y } });
      setState({ kind: 'done', x, y });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof ApiError ? err.message : 'שגיאת רשת — נסו שוב' });
    }
  };

  const dot = state.kind === 'sending' || state.kind === 'done' ? state : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-4 text-white">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold">בדיקת נוכחות</h2>
        <span className="rounded-full bg-white/10 px-3 py-1 text-lg tabular-nums">{left}</span>
      </div>

      {challenge.type === 'rollcall' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="text-6xl">📷</div>
          <p className="text-2xl font-semibold">סרקו עכשיו את הקוד החדש שעל הלוח</p>
          <p className="text-slate-300">פתחו את מצלמת הטלפון וכוונו אל המסך בכיתה</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-lg">{state.kind === 'done' ? 'התקבל ✓ תודה!' : 'הקישו על המקום שבו אתם יושבים'}</p>
          <div className="relative mx-auto w-full max-w-xl">
            {imageUrl ? (
              <img src={imageUrl} alt="תמונת הכיתה (מטושטשת)" onClick={tap} className="block w-full cursor-crosshair select-none rounded-xl" draggable={false} />
            ) : (
              <div className="aspect-video animate-pulse rounded-xl bg-white/10" />
            )}
            {dot && dot.x !== undefined && dot.y !== undefined && (
              <span
                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-emerald-500 shadow-lg"
                style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
              />
            )}
          </div>
          {state.kind === 'error' && <p className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-red-200">{state.message}</p>}
          <p className="mt-auto pt-4 text-center text-xs text-slate-400">התמונה מטושטשת בכוונה — אף אחד לא מזוהה בה.</p>
        </>
      )}
    </div>
  );
}
