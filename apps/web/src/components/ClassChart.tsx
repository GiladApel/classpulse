import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import type { GuideOutline } from '../lib/content';

interface ChartRow {
  studentName: string;
  studentNumber: string;
  submissionId: string;
  total: number;
  questions: Record<string, number>;
  sections: Record<string, number>;
}

interface Chart {
  graded: number;
  rows: ChartRow[];
}

const letter = (i: number) => String.fromCharCode(1488 + i);

/** Lecturer: the AI's grades of the hand-ins, overall, per question or per section. Equal scores share a place. */
export default function ClassChart({ assignmentId, outline, refreshKey }: { assignmentId: string; outline: GuideOutline | null; refreshKey?: unknown }) {
  const [chart, setChart] = useState<Chart | null>(null);
  const [metric, setMetric] = useState('total');

  useEffect(() => {
    api.get<Chart>(`/assignments/${assignmentId}/chart`).then(setChart, () => setChart(null));
  }, [assignmentId, refreshKey]);

  if (!chart) return null;
  if (chart.rows.length === 0) return <p className="text-sm text-slate-500">עוד אין הגשות שנבדקו.</p>;

  const options = [
    { id: 'total', label: 'ציון כולל' },
    ...(outline?.questions ?? []).flatMap((q, qi) => [
      { id: `q:${q.id}`, label: `שאלה ${qi + 1}` },
      ...(q.sections.length > 1 ? q.sections.map((s, si) => ({ id: `s:${s.id}`, label: `שאלה ${qi + 1}${letter(si)}` })) : []),
    ]),
  ];
  const value = (r: ChartRow) => (metric === 'total' ? r.total : metric.startsWith('q:') ? (r.questions[metric.slice(2)] ?? 0) : (r.sections[metric.slice(2)] ?? 0));
  const rows = [...chart.rows].sort((a, b) => value(b) - value(a));
  const place = (r: ChartRow) => 1 + rows.filter((o) => value(o) > value(r)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">ציוני ההגשות ({chart.graded})</h3>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="מדד בתרשים" className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <ol className="flex flex-col gap-1.5" aria-label="תרשים הכיתה">
        {rows.map((r) => {
          const v = value(r);
          return (
            <li key={r.submissionId} className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
              <span className="text-center tabular-nums text-slate-500">{place(r)}</span>
              <span className="relative h-7 overflow-hidden rounded-lg bg-slate-100">
                <span className="absolute inset-y-0 start-0 rounded-lg bg-indigo-200" style={{ width: `${Math.max(2, v)}%` }} />
                <span className="relative flex h-full items-center px-2 font-medium text-slate-800">
                  <Link to={`/hw/${r.submissionId}`} className="hover:underline">
                    {r.studentName}
                  </Link>
                </span>
              </span>
              <span className="tabular-nums text-slate-600">{v}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-slate-400">ציוני ה-AI הם טיוטה לבדיקה שלכם. הסטודנטים לא רואים את הציון ולא את הדירוג.</p>
    </div>
  );
}
