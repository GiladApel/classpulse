import { useState } from 'react';
import { Link } from 'react-router';
import { type CourseRecord, DAYS, DAYS_SHORT, type SlotRecord } from '../lib/timetable';

interface Props {
  slots: SlotRecord[];
  courseById: Map<string, CourseRecord>;
  /** Courses with a lesson running right now. */
  liveCourses: Set<string>;
  linkFor: (courseId: string) => string;
}

/** The week's lessons: Sunday to Friday side by side on a computer, one day at a time on a phone. */
export default function Timetable({ slots, courseById, liveCourses, linkFor }: Props) {
  const today = new Date().getDay();
  const [day, setDay] = useState(today === 6 ? 0 : today);
  const days = slots.some((s) => s.weekday === 6) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5];
  const onDay = (d: number) => slots.filter((s) => s.weekday === d).sort((a, b) => a.starts.localeCompare(b.starts));

  if (slots.length === 0) return <p className="text-sm text-slate-500">עוד לא נקבעה מערכת שעות לקורסים שלך.</p>;

  const card = (s: SlotRecord) => {
    const course = courseById.get(s.course);
    const live = liveCourses.has(s.course);
    return (
      <Link
        key={s.id}
        to={linkFor(s.course)}
        className={`flex flex-col gap-0.5 rounded-xl border p-2.5 text-sm transition-colors hover:border-indigo-400 ${live ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}
      >
        <span className="flex items-center justify-between gap-1 tabular-nums text-slate-500" dir="ltr">
          <span>
            {s.starts}–{s.ends}
          </span>
          {live && <span className="rounded-full bg-emerald-600 px-1.5 text-xs text-white">LIVE</span>}
        </span>
        <span className="font-semibold text-slate-900">{course?.code}</span>
        <span className="truncate text-slate-600">{course?.name}</span>
        {s.room && <span className="text-xs text-slate-500">חדר {s.room}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* Phone: a strip of days, then the chosen day. */}
      <div className="md:hidden">
        <div role="tablist" className="mb-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={d === day}
              aria-label={`יום ${DAYS[d]}`}
              onClick={() => setDay(d)}
              className={`relative rounded-xl py-2 text-sm font-medium ${d === day ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
            >
              {DAYS_SHORT[d]}
              {onDay(d).length > 0 && d !== day && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-500" />}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">{onDay(day).length ? onDay(day).map(card) : <p className="py-4 text-center text-sm text-slate-500">אין שיעורים ביום {DAYS[day]}.</p>}</div>
      </div>

      {/* Computer: the whole week. */}
      <div className="hidden gap-2 md:grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => (
          <div key={d} className="flex min-w-0 flex-col gap-2">
            <div className={`rounded-lg py-1 text-center text-sm font-semibold ${d === today ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>{DAYS[d]}</div>
            {onDay(d).map(card)}
          </div>
        ))}
      </div>
    </>
  );
}
