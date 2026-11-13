import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { type AssignmentRecord, MAX_CHECKS } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';
import { Card } from './ui';

/** Student: the homework of a course (or of one lesson): handed in or not, my latest feedback score and the checks used. */
export default function StudentAssignments({ courseId, sessionId }: { courseId: string; sessionId?: string }) {
  const userId = pb.authStore.record?.id ?? '';
  const filter = sessionId ? pb.filter('course = {:c} && session = {:s}', { c: courseId, s: sessionId }) : pb.filter('course = {:c}', { c: courseId });
  const assignments = useLiveRecords<AssignmentRecord>('assignments', filter, '-created_at');
  const [mine, setMine] = useState<Map<string, RecordModel>>(new Map());

  useEffect(() => {
    pb.collection('submissions')
      .getFullList({ filter: pb.filter('assignment.course = {:c} && student = {:u}', { c: courseId, u: userId }) })
      .then((list) => setMine(new Map(list.map((s) => [s.assignment, s]))), () => {});
  }, [courseId, userId, assignments.length]);

  const sorted = [...assignments].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Card>
      <h2 className="mb-1 font-semibold">שיעורי בית</h2>
      <p className="mb-2 text-sm text-slate-500">לפני שמגישים: מעלים את הפתרון ומקבלים משוב לכל סעיף — עד {MAX_CHECKS} פעמים לכל מטלה, ואז מגישים.</p>
      {assignments.length === 0 && <p className="text-sm text-slate-500">אין שיעורי בית עדיין.</p>}
      <ul className="divide-y divide-slate-100">
        {sorted.map((a) => {
          const s = mine.get(a.id);
          return (
            <li key={a.id}>
              <Link to={`/a/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-indigo-700">
                <span>
                  <span className="font-medium">{a.title}</span>
                  {a.due_at && <span className="ms-2 text-xs text-slate-500">עד {parseDate(a.due_at).toLocaleDateString('he-IL')}</span>}
                </span>
                <span className="text-sm">
                  {s?.handed_in_at ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">✓ הוגש</span>
                  ) : s && s.total >= 0 ? (
                    <span className="text-slate-700">
                      <b className="tabular-nums">{s.total}</b> · {s.check_count}/{MAX_CHECKS} בדיקות · <span className="text-amber-700">לא הוגש</span>
                    </span>
                  ) : a.guide_status === 'ready' ? (
                    <span className="text-indigo-600">לקבלת משוב ←</span>
                  ) : (
                    <span className="text-slate-400">בהכנה</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
