import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import { parseDate } from './device';
import { pb } from './pb';

export type ChallengeRecord = RecordModel & {
  type: 'rollcall' | 'visual_ping';
  status: 'pending' | 'active' | 'closed';
  expires_at: string;
  started_at: string;
  headcount: string;
  image: string;
};

/** Latest challenge of a session, kept live via PocketBase realtime (PB only pushes it to allowed viewers). */
export function useLatestChallenge(sessionId: string): ChallengeRecord | null {
  const [challenge, setChallenge] = useState<ChallengeRecord | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const col = pb.collection('challenges');
    const filter = pb.filter('session = {:s}', { s: sessionId });

    const unsubscribe = col.subscribe<ChallengeRecord>(
      '*',
      ({ action, record }) => {
        if (action === 'delete') return setChallenge((c) => (c?.id === record.id ? null : c));
        setChallenge((c) => (!c || c.id === record.id || record.started_at >= c.started_at ? record : c));
      },
      { filter },
    );
    col
      .getList<ChallengeRecord>(1, 1, { filter, sort: '-started_at' })
      .then((r) => !cancelled && setChallenge((c) => c ?? r.items[0] ?? null))
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe.then((fn) => fn()).catch(() => {});
    };
  }, [sessionId]);

  return challenge;
}

/** Seconds left until an ISO timestamp, ticking every 250 ms; 0 when passed. */
export function useCountdown(until: string | undefined): number {
  const calc = () => (until ? Math.max(0, Math.ceil((parseDate(until).getTime() - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (!until) return;
    const id = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);
  return left;
}

export const isRunning = (c: ChallengeRecord | null, secondsLeft: number): c is ChallengeRecord =>
  !!c && c.status === 'active' && secondsLeft > 0;

/** URL for a protected PB file (needs a short-lived file token). */
export function useProtectedFileUrl(record: RecordModel | null, field: string): string {
  const [url, setUrl] = useState('');
  const filename = record?.[field] as string | undefined;
  useEffect(() => {
    if (!record || !filename) return setUrl('');
    let cancelled = false;
    pb.files
      .getToken()
      .then((token) => !cancelled && setUrl(pb.files.getURL(record, filename, { token })))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, filename]);
  return url;
}
