import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../lib/api';
import { parseDate } from '../lib/device';
import { useLessonHomework } from '../lib/lessonHomework';
import { startLesson } from '../lib/lessons';
import { pb } from '../lib/pb';
import type { SessionRecord } from '../lib/timetable';
import { useLiveRecords } from '../lib/useLiveRecords';
import HomeworkBadge from './HomeworkBadge';
import { Button, Card, ErrorText } from './ui';

/** The course's lessons, the running one first, each with its homework status. The lecturer can start a new lesson from here. */
export default function CourseLessons({ courseId, lecturer }: { courseId: string; lecturer: boolean }) {
  const navigate = useNavigate();
  const sessions = useLiveRecords<SessionRecord>('sessions', pb.filter('course = {:c}', { c: courseId }), '-started_at');
  const homework = useLessonHomework(courseId, lecturer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sorted = [...sessions].sort((a, b) => (a.status === b.status ? b.started_at.localeCompare(a.started_at) : a.status === 'active' ? -1 : 1));
  const running = sorted.find((s) => s.status === 'active');

  const start = async () => {
    setError('');
    setBusy(true);
    try {
      navigate(`/lesson/${(await startLesson(courseId)).id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה בפתיחת השיעור');
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">שיעורים</h2>
        {lecturer && !running && (
          <Button onClick={start} disabled={busy}>
            {busy ? 'פותח…' : 'התחלת שיעור עכשיו'}
          </Button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      {sorted.length === 0 && <p className="text-sm text-slate-500">עוד אין שיעורים.</p>}
      <ul className="divide-y divide-slate-100">
        {sorted.map((x) => (
          <li key={x.id}>
            <Link to={`/lesson/${x.id}`} className="flex items-center justify-between gap-2 py-3 hover:text-indigo-700">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{x.title}</span>
                <span className="text-xs text-slate-500">{parseDate(x.started_at).toLocaleDateString('he-IL')}</span>
                {homework.get(x.id) && <HomeworkBadge hw={homework.get(x.id)!} lecturer={lecturer} />}
              </span>
              {x.status === 'active' ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">● פעיל עכשיו</span> : <span className="text-slate-400">←</span>}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
