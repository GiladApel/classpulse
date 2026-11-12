import type { RecordModel } from 'pocketbase';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, ErrorText, Field, inputClass } from '../components/ui';
import { api, ApiError, type SessionDto } from '../lib/api';
import { getLocation, parseDate } from '../lib/device';
import { pb, useUser } from '../lib/pb';
import { useIsAdmin } from '../lib/useIsAdmin';

export default function LecturerHomePage() {
  const user = useUser()!;
  const navigate = useNavigate();
  const [courses, setCourses] = useState<RecordModel[]>([]);
  const [sessions, setSessions] = useState<RecordModel[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [courseError, setCourseError] = useState('');
  const admin = useIsAdmin();

  const loadCourses = () => pb.collection('courses').getFullList({ filter: pb.filter('lecturer = {:u}', { u: user.id }), sort: 'code' }).then(setCourses);

  useEffect(() => {
    loadCourses();
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

  const addCourse = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setCourseError('');
    try {
      await api.post('/courses', { code: f.get('code'), name: f.get('name') });
      form.reset();
      await loadCourses();
    } catch (err) {
      setCourseError(err instanceof ApiError ? err.message : 'שגיאה ביצירת הקורס');
    }
  };

  const today = new Date().toLocaleDateString('he-IL');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-indigo-700">ClassPulse · מרצה</h1>
        <div className="flex items-center gap-1">
          {admin && (
            <Link to="/admin" className="rounded-xl px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50">
              ניהול משתמשים
            </Link>
          )}
          <Button variant="ghost" onClick={() => pb.authStore.clear()} className="text-sm">
            התנתקות
          </Button>
        </div>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">פתיחת שיעור</h2>
        {courses.length === 0 ? (
          <p className="text-slate-600">עוד אין לך קורסים — צרו את הראשון למטה.</p>
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
        <h2 className="mb-3 text-lg font-semibold">קורס חדש</h2>
        <form onSubmit={addCourse} className="flex flex-wrap gap-2">
          <input name="code" required maxLength={20} placeholder="קוד (למשל I2SE)" dir="ltr" aria-label="קוד קורס" className={`${inputClass} w-36`} />
          <input name="name" required maxLength={120} placeholder="שם הקורס" aria-label="שם הקורס" className={`${inputClass} min-w-0 flex-1`} />
          <Button type="submit" variant="secondary">
            יצירה
          </Button>
        </form>
        <div className="mt-2">
          <ErrorText>{courseError}</ErrorText>
        </div>
      </Card>

      {courses.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">מטלות לפי קורס</h2>
          <ul className="flex flex-wrap gap-2">
            {courses.map((c) => (
              <li key={c.id}>
                <Link to={`/course/${c.id}`} className="inline-block rounded-xl border border-slate-200 px-3 py-2 hover:border-indigo-400 hover:text-indigo-700">
                  📝 {c.code} · {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
                  {parseDate(s.started_at).toLocaleDateString('he-IL')}
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
