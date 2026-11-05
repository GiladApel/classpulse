import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import ChallengeOverlay from '../components/ChallengeOverlay';
import StudentLivePanel from '../components/StudentLivePanel';
import { Card, Screen } from '../components/ui';
import { api, ApiError, type RecordDto } from '../lib/api';
import { formatTime, getDeviceId, getLocation } from '../lib/device';
import { pb } from '../lib/pb';

type State =
  | { kind: 'locating' | 'sending' }
  | { kind: 'done'; record: RecordDto; already: boolean; title: string }
  | { kind: 'error'; message: string }
  | { kind: 'onboarding' };

interface CheckInResponse {
  record: RecordDto;
  alreadyCheckedIn: boolean;
  sessionTitle: string;
}

/** Zero taps: opening the scanned URL checks in immediately. */
export default function CheckInPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'locating' });
  const [active, setActive] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const location = await getLocation();
      setState({ kind: 'sending' });
      try {
        const res = await api.post<CheckInResponse>('/checkins', { token, deviceId: getDeviceId(), location });
        setState({ kind: 'done', record: res.record, already: res.alreadyCheckedIn, title: res.sessionTitle });
        if (res.record.sessionId) pb.collection('sessions').getOne(res.record.sessionId).then((s) => setActive(s.status === 'active'), () => {});
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ONBOARDING_REQUIRED') return setState({ kind: 'onboarding' });
        setState({ kind: 'error', message: e instanceof ApiError && e.status < 500 ? e.message : 'שגיאת רשת — נסו לסרוק שוב' });
      }
    })();
  }, [token]);

  if (state.kind === 'onboarding') return <Navigate to={`/onboarding?next=/c/${token}`} replace />;

  return (
    <Screen>
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        {(state.kind === 'locating' || state.kind === 'sending') && (
          <>
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-lg text-slate-700">{state.kind === 'locating' ? 'מאתר מיקום…' : 'רושם נוכחות…'}</p>
          </>
        )}
        {state.kind === 'done' && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-5xl text-emerald-600">✓</div>
            <h1 className="text-2xl font-bold">{state.already ? 'כבר נרשמת' : 'הנוכחות נרשמה'}</h1>
            <p className="text-slate-600">
              {state.title} · {formatTime(state.record.checkedInAt)}
            </p>
            {state.record.geoFlag && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                לא הצלחנו לאמת שאתם בכיתה לפי המיקום — המרצה יראה סימון ליד שמכם.
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">השאירו את הדף פתוח — סקרים ובדיקות נוכחות יופיעו כאן.</p>
            {state.record.sessionId && <ChallengeOverlay sessionId={state.record.sessionId} />}
          </>
        )}
        {state.kind === 'error' && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-5xl text-red-600">!</div>
            <h1 className="text-xl font-bold">הנוכחות לא נרשמה</h1>
            <p className="text-slate-700">{state.message}</p>
          </>
        )}
      </Card>
      {state.kind === 'done' && state.record.sessionId && state.record.status !== 'removed' && (
        <StudentLivePanel sessionId={state.record.sessionId} active={active} />
      )}
    </Screen>
  );
}
