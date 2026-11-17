import { useCountdown } from '../lib/useChallenge';

/** Time left on a timed poll (m:ss); nothing for a poll the lecturer closes by hand. */
export default function PollTimer({ closesAt, className = '' }: { closesAt?: string; className?: string }) {
  const left = useCountdown(closesAt || undefined);
  if (!closesAt || left <= 0) return null;
  return (
    <span className={`tabular-nums ${className}`} aria-label={`נותרו ${left} שניות`} dir="ltr">
      ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}
