import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Button, Card, ErrorText, inputClass } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useUser } from '../lib/pb';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  studentNumber: string;
  role: 'student' | 'lecturer';
}

/** Admin: find a registered user and make them a lecturer (or back). Lecturers then create their own courses. */
export default function AdminPage() {
  const user = useUser();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      api.get<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(q)}`).then(
        (r) => {
          setError('');
          setUsers(r.users);
        },
        (e) => setError(e instanceof ApiError && e.status === 403 ? 'הדף הזה למנהלים בלבד.' : 'שגיאה בטעינת המשתמשים'),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [q, user]);

  if (!user) return <Navigate to="/login?next=/admin" replace />;

  const setRole = async (u: AdminUser, role: AdminUser['role']) => {
    setError('');
    try {
      const updated = await api.post<AdminUser>(`/admin/users/${u.id}/role`, { role });
      setUsers((list) => list?.map((x) => (x.id === u.id ? updated : x)) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה');
    }
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-indigo-700">ניהול משתמשים</h1>
        <Link to="/" className="text-sm text-indigo-600 hover:underline">
          חזרה ←
        </Link>
      </header>
      <Card>
        <p className="mb-3 text-sm text-slate-600">כל מי שנרשם מופיע כאן. הופכים משתמש למרצה, והוא יוצר לעצמו את הקורסים שלו.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, מייל או מספר סטודנט" aria-label="חיפוש משתמש" className={`${inputClass} w-full`} />
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
        {users && users.length === 0 && <p className="py-4 text-center text-slate-500">לא נמצאו משתמשים.</p>}
        <ul className="divide-y divide-slate-100">
          {users?.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {u.name || '—'}{' '}
                  <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${u.role === 'lecturer' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}>
                    {u.role === 'lecturer' ? 'מרצה' : 'סטודנט'}
                  </span>
                </div>
                <div className="truncate text-sm text-slate-500" dir="ltr">
                  {u.email}
                  {u.studentNumber && ` · ${u.studentNumber}`}
                </div>
              </div>
              {u.id !== user.id &&
                (u.role === 'lecturer' ? (
                  <Button variant="secondary" onClick={() => setRole(u, 'student')} className="text-sm">
                    החזרה לסטודנט
                  </Button>
                ) : (
                  <Button onClick={() => setRole(u, 'lecturer')} className="text-sm">
                    הפיכה למרצה
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
