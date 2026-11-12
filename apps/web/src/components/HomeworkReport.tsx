import type { SubmissionView } from '../lib/content';

const tone = (score: number) => (score >= 85 ? 'text-emerald-700 bg-emerald-50' : score >= 60 ? 'text-amber-800 bg-amber-50' : 'text-red-700 bg-red-50');

/** One student's latest check: total, place in the class, and for each section what meets the requirements, what is missing and where to go. */
export default function HomeworkReport({ view }: { view: SubmissionView }) {
  const { submission: s, outline } = view;
  const report = s.report;

  return (
    <div className="flex flex-col gap-4">
      {s.status === 'processing' && (
        <p className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-indigo-900">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          ה-AI בודק את הפתרון… זה לוקח בדרך כלל פחות מדקה.
        </p>
      )}
      {s.status === 'failed' && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{s.error || 'הבדיקה נכשלה — נסו שוב (הבדיקה לא נספרה)'}</p>}

      {report && outline && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-5xl font-bold tabular-nums text-slate-900">{s.total}</span>
            <span className="text-slate-600">/ 100</span>
            <span className="text-sm text-slate-500">
              {view.place !== null ? `מקום ${view.place} מתוך ${view.checked} שנבדקו` : `המיקום בכיתה יוצג מ-3 בדיקות (כרגע ${view.checked})`}
            </span>
          </div>

          {report.marks.some((m) => !m.answered) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <b>סעיפים שלא נענו:</b>{' '}
              {outline.questions
                .flatMap((q, qi) => q.sections.map((sec, si) => ({ sec, label: `${qi + 1}${q.sections.length > 1 ? String.fromCharCode(1488 + si) : ''}` })))
                .filter(({ sec }) => !report.marks.find((m) => m.id === sec.id)?.answered)
                .map(({ label }) => `שאלה ${label}`)
                .join(', ')}
            </div>
          )}

          <ol className="flex flex-col gap-4">
            {outline.questions.map((q, qi) => (
              <li key={q.id} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
                  <h3 className="font-semibold">
                    {qi + 1}. {q.title}
                  </h3>
                  <span className="tabular-nums font-semibold text-slate-700">{report.questions.find((x) => x.id === q.id)?.score ?? 0}</span>
                </div>
                {q.sections.map((sec, si) => {
                  const m = report.marks.find((x) => x.id === sec.id);
                  return (
                    <div key={sec.id} className="flex flex-col gap-1 rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">
                          {q.sections.length > 1 && <span className="text-slate-500">{String.fromCharCode(1488 + si)}. </span>}
                          {sec.asked}
                        </p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-bold tabular-nums ${m?.answered ? tone(m.score) : 'bg-slate-100 text-slate-500'}`}>{m?.answered ? m.score : 'לא נענה'}</span>
                      </div>
                      {m?.meets && <p className="text-sm text-emerald-800">✓ {m.meets}</p>}
                      {m?.missing && <p className="text-sm text-red-800">✗ {m.missing}</p>}
                      {m?.direction && <p className="text-sm text-indigo-800">→ {m.direction}</p>}
                    </div>
                  );
                })}
              </li>
            ))}
          </ol>

          {view.commonMistakes.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-3">
              <h3 className="mb-1 text-sm font-semibold text-slate-700">טעויות נפוצות בכיתה</h3>
              <ul className="flex flex-col gap-1 text-sm text-slate-700">
                {view.commonMistakes.map((c) => (
                  <li key={c.title}>
                    • <b>{c.title}</b> {c.description && `— ${c.description}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
