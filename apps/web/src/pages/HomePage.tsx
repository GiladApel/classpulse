import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Button, Card, Screen } from '../components/ui';
import { pb, useUser } from '../lib/pb';

export default function HomePage() {
  const user = useUser();
  const [courses, setCourses] = useState<RecordModel[]>([]);

  // "My courses" = courses with at least one session I attended; that is also what unlocks summaries and homework.
  useEffect(() => {
    if (!user?.student_id || user.role === 'lecturer') return;
    pb.collection('attendance_records')
      .getFullList({ filter: pb.filter("student = {:u} && status != 'removed'", { u: user.id }), expand: 'session.course' })
      .then((records) => {
        const byId = new Map<string, RecordModel>();
        for (const r of records) {
          const c = r.expand?.session?.expand?.course as RecordModel | undefined;
          if (c) byId.set(c.id, c);
        }
        setCourses([...byId.values()]);
      })
      .catch(() => {});
  }, [user?.id, user?.student_id, user?.role]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'lecturer') return <Navigate to="/dash" replace />;
  if (!user.student_id) return <Navigate to="/onboarding" replace />;

  return (
    <Screen>
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="text-6xl">📷</div>
        <h1 className="text-2xl font-bold">שלום {user.name.split(' ')[0]}</h1>
        <p className="text-slate-600">כדי לסמן נוכחות, סרקו עם מצלמת הטלפון את הקוד שמוקרן בכיתה.</p>
      </Card>
      {courses.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">הקורסים שלי</h2>
          <ul className="divide-y divide-slate-100">
            {courses.map((c) => (
              <li key={c.id}>
                <Link to={`/course/${c.id}`} className="flex items-center justify-between py-3 hover:text-indigo-700">
                  <span>
                    {c.code} · {c.name}
                  </span>
                  <span className="text-sm text-slate-400">סיכומים ומטלות ←</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Button variant="ghost" onClick={() => pb.authStore.clear()} className="self-center text-sm">
        התנתקות
      </Button>
    </Screen>
  );
}
