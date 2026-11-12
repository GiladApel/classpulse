import { type FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { pb } from '../lib/pb';
import { type CourseRecord, DAYS, type SlotRecord } from '../lib/timetable';
import { Button, Card, ErrorText, Field, inputClass } from './ui';

interface Row {
  weekday: number;
  starts: string;
  ends: string;
  room: string;
}

const dateOnly = (v: string) => (v ? v.slice(0, 10) : '');

/** Lecturer: the course's weekly meetings (day, from, to, room) and the term dates. Saved as a whole. */
export default function TimetableEditor({ course }: { course: CourseRecord }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [termStart, setTermStart] = useState(dateOnly(course.term_start));
  const [termEnd, setTermEnd] = useState(dateOnly(course.term_end));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    pb.collection('course_slots')
      .getFullList<SlotRecord>({ filter: pb.filter('course = {:c}', { c: course.id }), sort: 'weekday,starts' })
      .then((list) => setRows(list.map((s) => ({ weekday: s.weekday, starts: s.starts, ends: s.ends, room: s.room }))), () => {});
  }, [course.id]);

  const set = (i: number, patch: Partial<Row>) => {
    setSaved(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.put(`/courses/${course.id}/timetable`, { slots: rows, termStart: termStart || undefined, termEnd: termEnd || undefined });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-1 font-semibold">מערכת שעות</h2>
      <p className="mb-3 text-sm text-slate-500">המפגשים הקבועים בכל שבוע. הסטודנטים ברשימה רואים אותם במערכת השעות שלהם.</p>
      <form onSubmit={save} className="flex flex-col gap-3">
        {rows.length === 0 && <p className="text-sm text-slate-500">עוד אין מפגשים.</p>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_7rem_7rem_1fr_auto] sm:border-0 sm:p-0">
            <select value={r.weekday} onChange={(e) => set(i, { weekday: Number(e.target.value) })} aria-label="יום" className={inputClass}>
              {DAYS.map((d, n) => (
                <option key={d} value={n}>
                  יום {d}
                </option>
              ))}
            </select>
            <input type="time" value={r.starts} required onChange={(e) => set(i, { starts: e.target.value })} aria-label="משעה" className={inputClass} />
            <input type="time" value={r.ends} required onChange={(e) => set(i, { ends: e.target.value })} aria-label="עד שעה" className={inputClass} />
            <input value={r.room} maxLength={40} placeholder="חדר" onChange={(e) => set(i, { room: e.target.value })} aria-label="חדר" className={inputClass} />
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="col-span-2 text-sm text-red-600 hover:underline sm:col-span-1" aria-label="מחיקת מפגש">
              מחיקה
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => setRows([...rows, { weekday: rows.at(-1)?.weekday ?? 0, starts: '10:00', ends: '12:00', room: rows.at(-1)?.room ?? '' }])}
        >
          + מפגש שבועי
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="תחילת הסמסטר (לא חובה)">
            <input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} className={inputClass} />
          </Field>
          <Field label="סוף הסמסטר (לא חובה)">
            <input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          {busy ? 'שומר…' : saved ? '✓ נשמר' : 'שמירת מערכת השעות'}
        </Button>
      </form>
    </Card>
  );
}
