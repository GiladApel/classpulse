import { Link, Navigate } from 'react-router';
import AppShell from '../components/AppShell';
import Timetable from '../components/Timetable';
import { Card } from '../components/ui';
import { type UserRecord, useUser } from '../lib/pb';
import { useMyCourses } from '../lib/timetable';

export default function HomePage() {
  const user = useUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'lecturer') return <Navigate to="/dash" replace />;
  if (!user.student_id) return <Navigate to="/onboarding" replace />;
  return <StudentHome user={user} />;
}

/** Student: lessons running now, the week's timetable and my courses. Everything opens from here; no link per lesson. */
function StudentHome({ user }: { user: UserRecord }) {
  const { courses, courseById, slots, live, loaded } = useMyCourses(user);

  return (
    <AppShell wide>
      <h1 className="text-2xl font-bold">שלום {user.name.split(' ')[0]}</h1>

      {live.map((s) => (
        <Link
          key={s.id}
          to={`/lesson/${s.id}`}
          className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-600 p-4 text-white shadow-sm hover:bg-emerald-700"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm text-emerald-100">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> שיעור פעיל עכשיו
            </span>
            <span className="block truncate text-lg font-semibold">
              {courseById.get(s.course)?.code} · {s.title}
            </span>
          </span>
          <span className="shrink-0 rounded-xl bg-white/15 px-3 py-2 font-medium">כניסה לשיעור ←</span>
        </Link>
      ))}

      <Card>
        <h2 className="mb-3 font-semibold">מערכת השעות שלי</h2>
        <Timetable slots={slots} courseById={courseById} liveCourses={new Set(live.map((s) => s.course))} linkFor={(id) => `/course/${id}`} />
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">הקורסים שלי</h2>
        {loaded && courses.length === 0 && (
          <p className="text-sm text-slate-500">עוד לא נרשמת לקורס. המרצה מוסיף/ה אותך לפי מספר הסטודנט, או שסורקים את הקוד בכיתה.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {courses.map((c) => (
            <li key={c.id}>
              <Link to={`/course/${c.id}`} className="flex items-center justify-between py-3 hover:text-indigo-700">
                <span>
                  {c.code} · {c.name}
                </span>
                <span className="text-sm text-slate-400">שיעורים ומטלות ←</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-center text-sm text-slate-500">בכיתה? סרקו את הקוד שעל הלוח כדי לסמן נוכחות.</p>
    </AppShell>
  );
}
