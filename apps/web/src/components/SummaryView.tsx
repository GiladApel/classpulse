import { formatSec, type LectureSummary, type Timeline } from '../lib/content';

/** Lecture summary; with a timeline (lecturer only), "I'm lost" spikes are drawn over the chapters. */
export default function SummaryView({ summary, timeline }: { summary: LectureSummary; timeline?: Timeline | null }) {
  const lastChapter = summary.chapters[summary.chapters.length - 1]?.startSec ?? 0;
  const end = Math.max(lastChapter + 300, ...(timeline?.buckets.filter((b) => b.count > 0).map((b) => b.t + timeline.bucketSec) ?? [0]));
  const pos = (t: number) => `${Math.min(100, Math.max(0, (t / end) * 100))}%`;
  const peak = Math.max(1, ...(timeline?.buckets.map((b) => b.count) ?? [1]));

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl bg-indigo-50 p-3 leading-relaxed text-indigo-950">{summary.tldr}</p>

      {timeline && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">ציר זמן: פרקים ו"הלכתי לאיבוד"</p>
          <div className="relative h-16 overflow-hidden rounded-lg bg-slate-100" dir="ltr">
            {timeline.buckets.map((b) =>
              b.count > 0 ? (
                <div
                  key={b.t}
                  className={`absolute bottom-0 ${timeline.spikes.some((s) => s.t === b.t) ? 'bg-red-500' : 'bg-amber-300'}`}
                  style={{ left: pos(b.t), width: `max(3px, ${(timeline.bucketSec / end) * 100}%)`, height: `${(b.count / peak) * 100}%` }}
                  title={`${formatSec(b.t)} · ${b.count} לחצו`}
                />
              ) : null,
            )}
            {summary.chapters.map((c) => (
              <div key={c.startSec} className="absolute inset-y-0 border-s border-indigo-400" style={{ left: pos(c.startSec) }} title={c.title} />
            ))}
          </div>
          {timeline.spikes.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {timeline.spikes.map((s) => (
                <li key={s.t} className="text-red-700">
                  ⚠ {formatSec(s.t)} · {s.count} סטודנטים הלכו לאיבוד{s.chapter && <> בפרק "{s.chapter}"</>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">לא היו נקודות בלבול משמעותיות.</p>
          )}
        </div>
      )}

      <section>
        <h3 className="mb-2 font-semibold">פרקים</h3>
        <ol className="flex flex-col gap-2">
          {summary.chapters.map((c) => (
            <li key={c.startSec} className="flex gap-3">
              <span className="w-14 shrink-0 text-sm tabular-nums text-indigo-700" dir="ltr">
                {formatSec(c.startSec)}
              </span>
              <span>
                <span className="font-medium">{c.title}</span>
                {c.summary && <span className="text-slate-600"> — {c.summary}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {summary.concepts.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">מושגי מפתח</h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {summary.concepts.map((c) => (
              <div key={c.term} className="rounded-lg border border-slate-200 p-2">
                <dt className="font-medium">{c.term}</dt>
                <dd className="text-sm text-slate-600">{c.explanation}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {summary.questions.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">שאלות לחזרה</h3>
          <ol className="flex flex-col gap-2">
            {summary.questions.map((q, i) => (
              <li key={i}>
                <details className="rounded-lg border border-slate-200 p-2">
                  <summary className="cursor-pointer font-medium">
                    {i + 1}. {q.question}
                  </summary>
                  <p className="mt-1 text-sm text-slate-700">{q.answer}</p>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
