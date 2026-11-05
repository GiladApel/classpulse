/** Horizontal result bars; highlights the correct option once it is revealed (correctIndex ≥ 0). */
export default function PollBars({
  options,
  counts,
  correctIndex = -1,
  mine = -1,
  size = 'md',
}: {
  options: string[];
  counts: number[];
  correctIndex?: number;
  mine?: number;
  size?: 'md' | 'xl';
}) {
  const total = counts.reduce((a, b) => a + b, 0);
  const big = size === 'xl';
  return (
    <ul className={`flex flex-col ${big ? 'gap-4' : 'gap-2'}`}>
      {options.map((o, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        const correct = i === correctIndex;
        const wrongAfterReveal = correctIndex >= 0 && !correct;
        return (
          <li key={i} className={`relative overflow-hidden rounded-xl ${big ? 'bg-white/10 px-6 py-4 text-3xl' : 'bg-slate-100 px-3 py-2 text-sm'}`}>
            <div
              className={`absolute inset-y-0 start-0 transition-all duration-500 ${correct ? 'bg-emerald-500/70' : wrongAfterReveal ? (big ? 'bg-white/10' : 'bg-slate-300') : big ? 'bg-indigo-500/70' : 'bg-indigo-200'}`}
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex items-center justify-between gap-3">
              <span className="font-medium">
                {correct && '✓ '}
                {o}
                {i === mine && <span className={`ms-2 ${big ? 'text-xl' : 'text-xs'} opacity-70`}>(בחרת)</span>}
              </span>
              <span className="tabular-nums">
                {counts[i]} · {pct}%
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
