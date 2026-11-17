import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { pb } from '../lib/pb';
import { type ChallengeRecord, isAfterClass, until } from '../lib/useChallenge';

type Pending = ChallengeRecord & { expand?: { session?: { title: string } } };

/** Student home: after-class attendance checks still waiting for this student's tap. PB lists only lessons they attended. */
export default function AfterClassChecks() {
  const [pending, setPending] = useState<Pending[]>([]);

  useEffect(() => {
    const userId = pb.authStore.record?.id ?? '';
    const now = new Date().toISOString().replace('T', ' ');
    Promise.all([
      pb.collection('challenges').getFullList<Pending>({ filter: pb.filter("status = 'active' && type = 'visual_ping' && expires_at > {:now}", { now }), expand: 'session' }),
      pb.collection('challenge_responses').getFullList({ filter: pb.filter('student = {:u}', { u: userId }), fields: 'challenge' }),
    ])
      .then(([checks, answered]) => {
        const done = new Set(answered.map((r) => r.challenge as string));
        setPending(checks.filter((c) => isAfterClass(c) && !done.has(c.id)));
      })
      .catch(() => {});
  }, []);

  return (
    <>
      {pending.map((c) => (
        <Link key={c.id} to={`/lesson/${c.session}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 hover:bg-amber-100">
          <span>
            <span className="block font-semibold text-amber-950">בדיקת נוכחות: {c.expand?.session?.title ?? 'שיעור'}</span>
            <span className="text-sm text-amber-900">הקישו על המקום שלכם בתמונת הכיתה, עד {until(c.expires_at)}</span>
          </span>
          <span className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-amber-950">לבדיקה ←</span>
        </Link>
      ))}
    </>
  );
}
