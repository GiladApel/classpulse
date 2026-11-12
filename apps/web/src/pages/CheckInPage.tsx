import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { Card, Screen } from '../components/ui';
import { api, ApiError, type RecordDto } from '../lib/api';
import { getDeviceId, getLocation } from '../lib/device';
import type { CheckInBanner } from './LessonPage';

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

/** Zero taps: opening the scanned URL checks in immediately, then opens the lesson. */
export default function CheckInPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'locating' });
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
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ONBOARDING_REQUIRED') return setState({ kind: 'onboarding' });
        setState({ kind: 'error', message: e instanceof ApiError && e.status < 500 ? e.message : 'שגיאת רשת — נסו לסרוק שוב' });
      }
    })();
  }, [token]);

  if (state.kind === 'onboarding') return <Navigate to={`/onboarding?next=/c/${token}`} replace />;
  if (state.kind === 'done' && state.record.sessionId) {
    const checkIn: CheckInBanner = { already: state.already, at: state.record.checkedInAt, geoFlag: state.record.geoFlag };
    return <Navigate to={`/lesson/${state.record.sessionId}?tab=forum`} replace state={{ checkIn }} />;
  }

  return (
    <Screen>
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        {state.kind === 'error' ? (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-5xl text-red-600">!</div>
            <h1 className="text-xl font-bold">הנוכחות לא נרשמה</h1>
            <p className="text-slate-700">{state.message}</p>
          </>
        ) : (
          <>
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-lg text-slate-700">{state.kind === 'locating' ? 'מאתר מיקום…' : 'רושם נוכחות…'}</p>
          </>
        )}
      </Card>
    </Screen>
  );
}
