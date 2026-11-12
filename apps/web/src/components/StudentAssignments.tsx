import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AssignmentRecord } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { Card } from './ui';

const SUBMISSION_HE = { processing: 'בבדיקה', done: 'נבדק', failed: 'נכשל' } as const;

/** Student: the course's assignments and where each of my submissions stands. */
export default function StudentAssignments({ courseId }: { courseId: string }) {
  const userId = pb.authStore.record?.id ?? '';
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [mine, setMine] = useState<Map<string, RecordModel>>(new Map());

  useEffect(() => {
    pb.collection('assignments').getFullList<AssignmentRecord>({ filter: pb.filter('course = {:c}', { c: courseId }), sort: '-created_at' }).then(setAssignments, () => {});
    pb.collection('submissions')
      .getFullList({ filter: pb.filter('assignment.course = {:c} && student = {:u}', { c: courseId, u: userId }) })
      .then((list) => setMine(new Map(list.map((s) => [s.assignment, s]))), () => {});
  }, [courseId, userId]);

  return (
    <Card>
      <h2 className="mb-3 font-semibold">מטלות</h2>
      {assignments.length === 0 && <p className="text-sm text-slate-500">אין מטלות עדיין.</p>}
      <ul className="divide-y divide-slate-100">
        {assignments.map((a) => {
          const s = mine.get(a.id);
          return (
            <li key={a.id}>
              <Link to={`/a/${a.id}`} className="flex items-center justify-between gap-2 py-3 hover:text-indigo-700">
                <span>
                  <span className="font-medium">{a.title}</span>
                  {a.due_at && <span className="ms-2 text-xs text-slate-500">עד {parseDate(a.due_at).toLocaleDateString('he-IL')}</span>}
                </span>
                <span className="text-sm">
                  {s ? (
                    <span className={s.status === 'done' ? 'text-emerald-700' : 'text-slate-500'}>
                      {SUBMISSION_HE[s.status as keyof typeof SUBMISSION_HE]}
                      {s.status === 'done' && s.total >= 0 && ` · ${s.total}`}
                    </span>
                  ) : (
                    <span className="text-indigo-600">להגשה ←</span>
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
