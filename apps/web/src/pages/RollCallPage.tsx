import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Card, Screen } from '../components/ui';
import { api, ApiError } from '../lib/api';

/** Opened by scanning the roll-call QR: /r/<challengeId>.<window>.<sig> */
export default function RollCallPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<{ kind: 'sending' } | { kind: 'ok' } | { kind: 'error'; message: string }>({ kind: 'sending' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const challengeId = token.split('.')[0];
    api
      .post(`/challenges/${challengeId}/responses`, { token })
      .then(() => setState({ kind: 'ok' }))
      .catch((e) => setState({ kind: 'error', message: e instanceof ApiError && e.status < 500 ? e.message : 'שגיאת רשת — נסו לסרוק שוב' }));
  }, [token]);

  return (
    <Screen>
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        {state.kind === 'sending' && <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />}
        {state.kind === 'ok' && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-5xl text-emerald-600">✓</div>
            <h1 className="text-2xl font-bold">אומת — אתם בכיתה</h1>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-5xl text-red-600">!</div>
            <p className="text-slate-700">{state.message}</p>
          </>
        )}
      </Card>
    </Screen>
  );
}
