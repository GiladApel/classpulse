import type { RubricCriterion, SubmissionView } from '../lib/content';

const tone = (score: number) => (score >= 85 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700');

/** One submission's AI review. Shows only this student's work plus anonymous class-level aggregates. */
export default function ReviewView({ view, rubric }: { view: SubmissionView; rubric: RubricCriterion[] }) {
  const { submission: s, percentiles } = view;
  if (s.status === 'processing') {
    return (
      <p className="flex items-center gap-2 text-slate-600">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        ה-AI בודק את ההגשה…
      </p>
    );
  }
  if (s.status === 'failed' || !s.review) return <p className="text-red-700">{s.error || 'הבדיקה נכשלה'}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span className={`text-5xl font-bold tabular-nums ${tone(s.total ?? 0)}`}>{s.total}</span>
        <span className="text-slate-600">
          / 100
          {percentiles ? ` · אחוזון ${percentiles.total} בכיתה` : ` · אחוזונים יוצגו מ-5 הגשות (כרגע ${view.classSize})`}
        </span>
      </div>
      {s.review.summary && <p className="text-slate-700">{s.review.summary}</p>}

      <ul className="flex flex-col gap-3">
        {rubric.map((c) => {
          const r = s.review!.criteria.find((x) => x.id === c.id);
          if (!r) return null;
          return (
            <li key={c.id} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {c.criterion} <span className="text-xs text-slate-400">(משקל {c.weight})</span>
                </span>
                <span className="tabular-nums">
                  <span className={`text-xl font-bold ${tone(r.score)}`}>{r.score}</span>
                  {percentiles && <span className="ms-2 text-xs text-slate-500">אחוזון {percentiles.criteria[c.id]}</span>}
                </span>
              </div>
              {r.strengths.length > 0 && (
                <ul className="text-sm text-emerald-800">
                  {r.strengths.map((x, i) => (
                    <li key={i}>✓ {x}</li>
                  ))}
                </ul>
              )}
              {r.fixes.length > 0 && (
                <ul className="mt-1 text-sm text-slate-800">
                  {r.fixes.map((x, i) => (
                    <li key={i}>→ {x}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {view.commonMistakes.length > 0 && (
        <section className="rounded-xl bg-amber-50 p-3">
          <h3 className="mb-1 font-semibold text-amber-900">טעויות נפוצות בכיתה</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {view.commonMistakes.map((m) => (
              <li key={m.title}>
                <span className="font-medium">{m.title}</span>
                {m.description && <span className="text-slate-700"> — {m.description}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-slate-400">בדיקה אוטומטית של AI לפי המחוון — הציון הסופי נקבע על ידי הסגל.</p>
    </div>
  );
}
