import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import SummaryView from '../components/SummaryView';
import { Card } from '../components/ui';
import type { AssignmentRecord, RecordingRecord } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';

const SUBMISSION_HE = { processing: 'בבדיקה', done: 'נבדק', failed: 'נכשל' } as const;

/** Student: published lecture summaries (including lectures they missed) and assignments of one course. */
export default function CoursePage() {
  const { id = '' } = useParams();
  const userId = pb.authStore.record?.id ?? '';
  const [course, setCourse] = useState<RecordModel | null>(null);
  const [recordings, setRecordings] = useState<RecordingRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [mine, setMine] = useState<Map<string, RecordModel>>(new Map());
  const [open, setOpen] = useState('');

  useEffect(() => {
    pb.collection('courses').getOne(id).then(setCourse, () => {});
    // PocketBase rules return only published summaries of courses this student takes part in.
    pb.collection('recordings')
      .getFullList<RecordingRecord>({ filter: pb.filter('session.course = {:c}', { c: id }), sort: '-created_at', expand: 'session' })
      .then(setRecordings, () => {});
    pb.collection('assignments').getFullList<AssignmentRecord>({ filter: pb.filter('course = {:c}', { c: id }), sort: '-created_at' }).then(setAssignments, () => {});
    pb.collection('submissions')
      .getFullList({ filter: pb.filter('assignment.course = {:c} && student = {:u}', { c: id, u: userId }) })
      .then((list) => setMine(new Map(list.map((s) => [s.assignment, s]))), () => {});
  }, [id, userId]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        → בית
      </Link>
      <h1 className="text-2xl font-bold">
        {course?.code} · {course?.name}
      </h1>

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

      <Card>
        <h2 className="mb-3 font-semibold">סיכומי הרצאות</h2>
        {recordings.length === 0 && <p className="text-sm text-slate-500">עוד לא פורסמו סיכומים.</p>}
        <ul className="flex flex-col gap-2">
          {recordings.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200">
              <button onClick={() => setOpen(open === r.id ? '' : r.id)} className="flex w-full items-center justify-between p-3 text-start">
                <span className="font-medium">{(r.expand?.session as RecordModel | undefined)?.title ?? r.filename}</span>
                <span className="text-slate-400">{open === r.id ? '▲' : '▼'}</span>
              </button>
              {open === r.id && r.summary && (
                <div className="border-t border-slate-100 p-3">
                  <SummaryView summary={r.summary} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
