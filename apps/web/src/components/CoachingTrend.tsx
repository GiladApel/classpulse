import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CoachingTrendPoint, LectureCoaching } from '../lib/content';
import { parseDate } from '../lib/device';
import { Card } from './ui';

// Categorical slots 1–3 of the validated reference palette (light surface). Aqua is under 3:1, so every line is also
// labelled directly and the numbers are available as a table.
const SERIES: { key: keyof LectureCoaching['scores']; label: string; color: string }[] = [
  { key: 'clarity', label: 'בהירות', color: '#2a78d6' },
  { key: 'pace', label: 'קצב', color: '#eb6834' },
  { key: 'engagement', label: 'מעורבות', color: '#1baf7a' },
];

const W = 640;
const H = 220;
const PAD = { top: 16, right: 24, bottom: 36, left: 76 };

/** Lecturer: the three report scores across the course's lessons, oldest on the right (RTL reading order). */
export default function CoachingTrend({ courseId }: { courseId: string }) {
  const [points, setPoints] = useState<CoachingTrendPoint[]>([]);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    api.get<CoachingTrendPoint[]>(`/courses/${courseId}/coaching`).then(setPoints, () => {});
  }, [courseId]);

  if (points.length === 0) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  // Right-to-left: the first lesson sits on the right, like the rest of the page.
  const x = (i: number) => (points.length === 1 ? PAD.left + plotW / 2 : PAD.left + plotW - (i * plotW) / (points.length - 1));
  const y = (v: number) => PAD.top + plotH - ((v - 1) / 4) * plotH;
  const day = (p: CoachingTrendPoint) => parseDate(p.startedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  const last = points.length - 1;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">מגמת דוחות השיעור</h2>
        <ul className="flex flex-wrap gap-3 text-sm text-slate-700" aria-label="מקרא">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[320px]" role="img" aria-label="ציוני בהירות, קצב ומעורבות לפי שיעור" onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={W - PAD.right + 8} y={y(v) + 4} fontSize={11} fill="#64748b" textAnchor="start">
                {v}
              </text>
            </g>
          ))}
          {points.map((p, i) => (
            <text key={p.sessionId} x={x(i)} y={H - 12} fontSize={11} fill="#64748b" textAnchor="middle">
              {day(p)}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />}
          {SERIES.map((s) => (
            <g key={s.key}>
              {points.length > 1 && (
                <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={points.map((p, i) => `${x(i)},${y(p.scores[s.key])}`).join(' ')} />
              )}
              {points.map((p, i) => (
                <circle key={p.sessionId} cx={x(i)} cy={y(p.scores[s.key])} r={hover === i ? 5 : 4} fill={s.color} stroke="#ffffff" strokeWidth={2} />
              ))}
              {/* Direct label at the newest lesson (left end). */}
              <text x={x(last) - 10} y={y(points[last].scores[s.key]) + 4} fontSize={11} fill="#334155" textAnchor="end">
                {s.label}
              </text>
            </g>
          ))}
          {points.map((p, i) => (
            <rect
              key={p.sessionId}
              x={x(i) - Math.max(16, plotW / Math.max(1, points.length - 1) / 2)}
              y={PAD.top}
              width={Math.max(32, plotW / Math.max(1, points.length - 1))}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${p.title}: ${SERIES.map((s) => `${s.label} ${p.scores[s.key]}`).join(', ')}`}
            />
          ))}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg bg-white px-3 py-2 text-sm shadow ring-1 ring-slate-200"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)' }}
          >
            <p className="font-medium">
              {points[hover].title} · {day(points[hover])}
            </p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 tabular-nums text-slate-700">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}: {points[hover].scores[s.key]}/5
              </p>
            ))}
          </div>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">הצגה כטבלה</summary>
        <table className="mt-2 w-full text-start">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 text-start font-medium">שיעור</th>
              {SERIES.map((s) => (
                <th key={s.key} className="py-1 text-start font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {points.map((p) => (
              <tr key={p.sessionId}>
                <td className="py-1">
                  {p.title} · {day(p)}
                </td>
                {SERIES.map((s) => (
                  <td key={s.key} className="py-1">
                    {p.scores[s.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}
