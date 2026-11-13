import type { LessonHomework } from '../lib/lessonHomework';

const day = (d: Date) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });

/** A lesson's homework at a glance: to hand in (and by when), or handed in. The lecturer sees the due date only. */
export default function HomeworkBadge({ hw, lecturer }: { hw: LessonHomework; lecturer: boolean }) {
  if (!lecturer && hw.handedIn) return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">✓ מטלה הוגשה</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${lecturer ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-900'}`}>
      {lecturer ? 'מטלה' : 'מטלה להגשה'}
      {hw.dueAt && ` · עד ${day(hw.dueAt)}`}
    </span>
  );
}
