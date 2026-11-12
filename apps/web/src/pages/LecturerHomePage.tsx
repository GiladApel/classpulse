import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import AppShell from '../components/AppShell';
import Timetable from '../components/Timetable';
import { Button, Card, ErrorText, Field, inputClass } from '../components/ui';
import { api, ApiError, type SessionDto } from '../lib/api';
import { getLocation } from '../lib/device';
import { startLesson } from '../lib/lessons';
import { useUser } from '../lib/pb';
import { DAYS, nextSlot, slotNow, useMyCourses } from '../lib/timetable';

export default function LecturerHomePage() {
  const user = useUser()!;
  const navigate = useNavigate();
  const { courses, courseById, slots, live, loaded, reload } = useMyCourses(user);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [courseError, setCourseError] = useState('');

  const now = new Date();
  const current = slotNow(slots, now);
  const upcoming = current ? undefined : nextSlot(slots, now);
  const running = live[0];

  const run = async (fn: () => Promise<SessionDto>) => {
    setError('');
    setBusy(true);
    try {
      navigate(`/lesson/${(await fn()).id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שגיאה בפתיחת השיעור');
      setBusy(false);
    }
  };

  const startWithOptions = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    return run(async () => {
      const location = f.get('useLocation') ? await getLocation(8000) : undefined;
      return api.post<SessionDto>('/sessions', {
        courseId: f.get('courseId'),
        title: f.get('title'),
        location,
        geofenceMode: f.get('geofenceMode'),
        geofenceRadiusM: Number(f.get('radius')),
      });
    });
  };

  const addCourse = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setCourseError('');
    try {
      const created = await api.post<{ id: string }>('/courses', { code: f.get('code'), name: f.get('name') });
      form.reset();
      reload();
      navigate(`/course/${created.id}?tab=students`);
    } catch (err) {
      setCourseError(err instanceof ApiError ? err.message : 'שגיאה ביצירת הקורס');
    }
  };

  return (
    <AppShell wide>
      <h1 className="text-2xl font-bold">שלום {user.name.split(' ')[0]}</h1>

      {running ? (
        <Link to={`/lesson/${running.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-600 p-4 text-white shadow-sm hover:bg-emerald-700">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm text-emerald-100">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> שיעור פעיל
            </span>
            <span className="block truncate text-lg font-semibold">
              {courseById.get(running.course)?.code} · {running.title}
            </span>
          </span>
          <span className="shrink-0 rounded-xl bg-white/15 px-3 py-2 font-medium">חזרה לשיעור ←</span>
        </Link>
      ) : current ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-s-4 border-indigo-600">
          <span>
            <span className="text-sm text-slate-500">
              עכשיו לפי המערכת · {current.starts}–{current.ends}
              {current.room && ` · חדר ${current.room}`}
            </span>
            <span className="block text-lg font-semibold">
              {courseById.get(current.course)?.code} · {courseById.get(current.course)?.name}
            </span>
          </span>
          <Button onClick={() => run(() => startLesson(current.course))} disabled={busy}>
            {busy ? 'פותח…' : 'התחלת השיעור עכשיו'}
          </Button>
        </Card>
      ) : (
        upcoming && (
          <p className="text-sm text-slate-600">
            השיעור הבא: {courseById.get(upcoming.course)?.code} ביום {DAYS[upcoming.weekday]} ב-{upcoming.starts}
          </p>
        )
      )}
      <ErrorText>{error}</ErrorText>

      <Card>
        <h2 className="mb-3 font-semibold">מערכת השעות שלי</h2>
        <Timetable slots={slots} courseById={courseById} liveCourses={new Set(live.map((s) => s.course))} linkFor={(id) => `/course/${id}`} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">הקורסים שלי</h2>
          {loaded && courses.length === 0 && <p className="text-sm text-slate-500">עוד אין לך קורסים — צרו את הראשון כאן למטה.</p>}
          <ul className="divide-y divide-slate-100">
            {courses.map((c) => (
              <li key={c.id}>
                <Link to={`/course/${c.id}`} className="flex items-center justify-between py-3 hover:text-indigo-700">
                  <span>
                    {c.code} · {c.name}
                  </span>
                  <span className="text-sm text-slate-400">שיעורים, סטודנטים, מערכת ←</span>
                </Link>
              </li>
            ))}
          </ul>
          <form onSubmit={addCourse} className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <input name="code" required maxLength={20} placeholder="קוד (למשל I2SE)" dir="ltr" aria-label="קוד קורס" className={`${inputClass} w-36`} />
            <input name="name" required maxLength={120} placeholder="שם הקורס" aria-label="שם הקורס" className={`${inputClass} min-w-0 flex-1`} />
            <Button type="submit" variant="secondary">
              קורס חדש
            </Button>
          </form>
          <div className="mt-2">
            <ErrorText>{courseError}</ErrorText>
          </div>
        </Card>

        {courses.length > 0 && (
          <Card>
            <h2 className="mb-3 font-semibold">פתיחת שיעור עם הגדרות</h2>
            <form onSubmit={startWithOptions} className="grid gap-3">
              <Field label="קורס">
                <select name="courseId" defaultValue={current?.course} className={inputClass}>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="כותרת">
                <input name="title" maxLength={120} placeholder="ריק = הרצאה N" className={inputClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="בדיקת מיקום">
                  <select name="geofenceMode" defaultValue="lenient" className={inputClass}>
                    <option value="lenient">מקלה — מסמנת חריגה</option>
                    <option value="strict">מחמירה — חוסמת</option>
                  </select>
                </Field>
                <Field label="רדיוס (מטרים)">
                  <input name="radius" type="number" min={10} max={2000} defaultValue={50} className={inputClass} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input name="useLocation" type="checkbox" defaultChecked className="h-4 w-4" />
                להשתמש במיקום הנוכחי שלי כמרכז הכיתה
              </label>
              <Button type="submit" disabled={busy}>
                {busy ? 'פותח…' : 'התחלת שיעור'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
