import type { RecordModel } from 'pocketbase';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, ErrorText, Field, inputClass } from '../components/ui';
import { api, ApiError, type SessionDto } from '../lib/api';
import { getLocation } from '../lib/device';
import { pb, useUser } from '../lib/pb';

export default function LecturerHomePage() {
  const user = useUser()!;
  const navigate = useNavigate();
  const [courses, setCourses] = useState<RecordModel[]>([]);
  const [sessions, setSessions] = useState<RecordModel[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pb.collection('courses').getFullList({ filter: pb.filter('lecturer = {:u}', { u: user.id }), sort: 'code' }).then(setCourses);
    pb.collection('sessions')
      .getList(1, 15, { filter: pb.filter('course.lecturer = {:u}', { u: user.id }), sort: '-started_at', expand: 'course' })
      .then((r) => setSessions(r.items));
  }, [user.id]);

  const start = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    setBusy(true);
    try {
      const location = f.get('useLocation') ? await getLocation(8000) : undefined;
      if (f.get('useLocation') && !location) setError('המיקום לא זמין — השיעור ייפתח ללא בדיקת מיקום');
      const session = await api.post<SessionDto>('/sessions', {
        courseId: f.get('courseId'),
        title: f.get('title'),
        location,
        geofenceMode: f.get('geofenceMode'),
        geofenceRadiusM: Number(f.get('radius')),
      });
      navigate(`/dash/${session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שגיאה בפתיחת השיעור');
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toLocaleDateString('he-IL');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-indigo-700">ClassPulse · מרצה</h1>
        <Button variant="ghost" onClick={() => pb.authStore.clear()} className="text-sm">
          התנתקות
        </Button>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">פתיחת שיעור</h2>
        {courses.length === 0 ? (
          <p className="text-slate-600">אין קורסים משויכים לחשבון זה.</p>
        ) : (
          <form onSubmit={start} className="grid gap-4 md:grid-cols-2">
            <Field label="קורס">
              <select name="courseId" className={inputClass}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="כותרת">
              <input name="title" required defaultValue={`הרצאה ${today}`} maxLength={120} className={inputClass} />
            </Field>
            <Field label="בדיקת מיקום">
              <select name="geofenceMode" defaultValue="lenient" className={inputClass}>
                <option value="lenient">מקלה — מסמנת חריגה בלבד</option>
                <option value="strict">מחמירה — חוסמת סימון מרחוק</option>
              </select>
            </Field>
            <Field label="רדיוס (מטרים)">
              <input name="radius" type="number" min={10} max={2000} defaultValue={50} className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
              <input name="useLocation" type="checkbox" defaultChecked className="h-4 w-4" />
              להשתמש במיקום הנוכחי שלי כמרכז הכיתה
            </label>
            <div className="md:col-span-2">
              <ErrorText>{error}</ErrorText>
            </div>
            <Button type="submit" disabled={busy} className="md:col-span-2">
              {busy ? 'פותח…' : 'התחלת שיעור'}
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">שיעורים אחרונים</h2>
        {sessions.length === 0 && <p className="text-slate-600">עדיין אין שיעורים.</p>}
        <ul className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link to={`/dash/${s.id}`} className="flex items-center justify-between py-3 hover:text-indigo-700">
                <span>
                  {s.expand?.course?.code} · {s.title}
                </span>
                <span className="flex items-center gap-2 text-sm text-slate-500">
                  {new Date(s.started_at).toLocaleDateString('he-IL')}
                  {s.status === 'active' && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">פעיל</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
