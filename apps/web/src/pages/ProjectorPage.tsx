import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import PollBars from '../components/PollBars';
import { api, ApiError } from '../lib/api';
import { pb } from '../lib/pb';
import { useAttendance } from '../lib/useAttendance';
import { isRunning, useCountdown, useLatestChallenge } from '../lib/useChallenge';
import { currentPoll, type PollRecord, tally, useLiveRecords, useTick } from '../lib/useLiveRecords';

interface QrTicket {
  token: string;
  refreshInMs: number;
}

/** Full-screen rotating QR. Fetches a new server-signed token at each window boundary; switches to the roll-call QR while one runs. */
export default function ProjectorPage() {
  const { id = '' } = useParams();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ended, setEnded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [cycle, setCycle] = useState({ key: 0, ms: 10_000 });
  const [url, setUrl] = useState('');
  const { present } = useAttendance(id);
  const challenge = useLatestChallenge(id);
  const left = useCountdown(challenge?.expires_at);
  const running = isRunning(challenge, left);
  const rollcallId = running && challenge.type === 'rollcall' ? challenge.id : '';
  const visualPing = running && challenge.type === 'visual_ping';
  useTick(5000);
  const polls = useLiveRecords<PollRecord>('polls', pb.filter('session = {:s}', { s: id }));
  // A challenge outranks a poll; a closed poll's results stay up for 60 s.
  const poll = running ? null : currentPoll(polls, 60);
  const votes = useLiveRecords<PollRecord & { option_index: number }>('poll_votes', pb.filter('poll = {:p}', { p: poll?.id ?? '' }), '', !!poll);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const path = rollcallId ? `/challenges/${rollcallId}/qr` : `/sessions/${id}/qr`;
    const prefix = rollcallId ? '/r/' : '/c/';

    const tick = async () => {
      try {
        const { token, refreshInMs } = await api.get<QrTicket>(path);
        if (stopped) return;
        setOffline(false);
        const target = `${location.origin}${prefix}${token}`;
        setUrl(target);
        if (canvas.current) await QRCode.toCanvas(canvas.current, target, { width: 640, margin: 1, errorCorrectionLevel: 'M' });
        setCycle((c) => ({ key: c.key + 1, ms: refreshInMs }));
        timer = setTimeout(tick, refreshInMs + 50);
      } catch (e) {
        if (stopped) return;
        if (e instanceof ApiError && e.code === 'SESSION_ENDED') return setEnded(true);
        // A roll-call that just expired answers 409 until the countdown flips us back to the session QR.
        if (!(e instanceof ApiError && e.status === 409)) setOffline(true);
        timer = setTimeout(tick, 2000);
      }
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, rollcallId]);

  // The canvas unmounts while a poll or visual check is shown; redraw the last QR as soon as it is back.
  const showingQr = !ended && !poll && !visualPing;
  useEffect(() => {
    if (showingQr && url && canvas.current) QRCode.toCanvas(canvas.current, url, { width: 640, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {});
  }, [showingQr, url]);

  return (
    <main className={`flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-white transition-colors ${rollcallId ? 'bg-rose-950' : 'bg-slate-950'}`}>
      {ended ? (
        <h1 className="text-5xl font-bold">השיעור הסתיים · {present} נוכחים</h1>
      ) : poll ? (
        <div className="flex w-full max-w-5xl flex-col gap-8">
          <h1 className="text-center text-5xl font-bold leading-tight">{poll.question}</h1>
          <PollBars
            size="xl"
            options={poll.options}
            counts={poll.status === 'closed' && poll.results ? poll.results.counts : tally(poll.options, votes)}
            correctIndex={poll.status === 'closed' ? poll.answer_index : -1}
          />
          <p className="text-center text-2xl text-slate-300">
            {poll.status === 'open' ? `הצביעו בטלפון · ${votes.length} הצבעות` : `${poll.results?.total ?? 0} הצבעות · הסקר נסגר`}
          </p>
        </div>
      ) : visualPing ? (
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="text-8xl">📱</div>
          <h1 className="text-5xl font-bold">בדיקת נוכחות</h1>
          <p className="text-3xl">הקישו בטלפון על המקום שבו אתם יושבים</p>
          <p className="text-7xl font-bold tabular-nums text-amber-300">{left}</p>
        </div>
      ) : (
        <>
          <h1 className="text-4xl font-bold">{rollcallId ? `בדיקת נוכחות! סרקו שוב · ${left}` : 'סרקו עם מצלמת הטלפון'}</h1>
          <div className="rounded-3xl bg-white p-5">
            <canvas ref={canvas} className="block h-[min(70vh,640px)] w-[min(70vh,640px)]" />
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div key={cycle.key} className="h-full bg-indigo-600" style={{ animation: `shrink ${cycle.ms}ms linear forwards` }} />
            </div>
          </div>
          <p className="text-3xl tabular-nums">
            <span className="font-bold text-emerald-400">{present}</span> נרשמו
          </p>
          {offline && <p className="text-amber-400">אין חיבור לשרת — מנסה שוב…</p>}
          {/* Dev only: lets you test check-in on the same laptop (right-click → open in incognito). */}
          {import.meta.env.DEV && url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-slate-500 underline" dir="ltr">
              {url}
            </a>
          )}
        </>
      )}
      <style>{'@keyframes shrink { from { width: 100% } to { width: 0% } }'}</style>
    </main>
  );
}
