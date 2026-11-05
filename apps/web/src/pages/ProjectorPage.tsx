import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { api, ApiError } from '../lib/api';
import { useAttendance } from '../lib/useAttendance';

interface QrTicket {
  token: string;
  refreshInMs: number;
}

/** Full-screen rotating QR. Fetches a new server-signed token at each window boundary. */
export default function ProjectorPage() {
  const { id = '' } = useParams();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ended, setEnded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [cycle, setCycle] = useState({ key: 0, ms: 10_000 });
  const { present } = useAttendance(id);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const tick = async () => {
      try {
        const { token, refreshInMs } = await api.get<QrTicket>(`/sessions/${id}/qr`);
        if (stopped) return;
        setOffline(false);
        if (canvas.current) {
          await QRCode.toCanvas(canvas.current, `${location.origin}/c/${token}`, { width: 640, margin: 1, errorCorrectionLevel: 'M' });
        }
        setCycle((c) => ({ key: c.key + 1, ms: refreshInMs }));
        timer = setTimeout(tick, refreshInMs + 50);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'SESSION_ENDED') return setEnded(true);
        setOffline(true);
        timer = setTimeout(tick, 2000);
      }
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-950 p-6 text-white">
      {ended ? (
        <h1 className="text-5xl font-bold">השיעור הסתיים · {present} נוכחים</h1>
      ) : (
        <>
          <h1 className="text-4xl font-bold">סרקו עם מצלמת הטלפון</h1>
          <div className="rounded-3xl bg-white p-5">
            <canvas ref={canvas} className="block h-[min(70vh,640px)] w-[min(70vh,640px)]" />
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                key={cycle.key}
                className="h-full bg-indigo-600"
                style={{ animation: `shrink ${cycle.ms}ms linear forwards` }}
              />
            </div>
          </div>
          <p className="text-3xl tabular-nums">
            <span className="font-bold text-emerald-400">{present}</span> נרשמו
          </p>
          {offline && <p className="text-amber-400">אין חיבור לשרת — מנסה שוב…</p>}
        </>
      )}
      <style>{'@keyframes shrink { from { width: 100% } to { width: 0% } }'}</style>
    </main>
  );
}
