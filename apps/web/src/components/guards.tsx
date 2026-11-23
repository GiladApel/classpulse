import { type ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { api, ApiError } from '../lib/api';
import { pb, useUser } from '../lib/pb';

const nextParam = (loc: { pathname: string; search: string }) => `?next=${encodeURIComponent(loc.pathname + loc.search)}`;

export function RequireStudent({ children }: { children: ReactNode }) {
  const user = useUser();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login${nextParam(loc)}`} replace />;
  if (!user.student_id) return <LinkStudent />;
  return children;
}

/**
 * A student's first visit: the server gives them a student key and links every course roster that lists the email they
 * signed in with. Nothing to type; the page re-renders with the key once the session is refreshed.
 */
export function LinkStudent() {
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError('');
    api
      .post('/me/link')
      .then(() => pb.collection('users').authRefresh())
      .catch((e) => live && setError(e instanceof ApiError ? e.message : 'החיבור נכשל'));
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      {error ? (
        <>
          <p className="text-red-700">{error}</p>
          <button onClick={() => setAttempt((n) => n + 1)} className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white">
            ניסיון נוסף
          </button>
        </>
      ) : (
        <p className="text-slate-500">מחפשים את הקורסים שלך…</p>
      )}
    </div>
  );
}

/** Any signed-in user; a student is linked to their courses by email first. */
export function RequireSignedIn({ children }: { children: ReactNode }) {
  const user = useUser();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login${nextParam(loc)}`} replace />;
  if (user.role !== 'lecturer' && !user.student_id) return <LinkStudent />;
  return children;
}

export function RequireLecturer({ children }: { children: ReactNode }) {
  const user = useUser();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login${nextParam(loc)}`} replace />;
  if (user.role !== 'lecturer') return <Navigate to="/" replace />;
  return children;
}

/** Old lesson addresses (lecturer dashboard, student lecture page) now open the one lesson page. */
export function LessonRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/lesson/${id}`} replace />;
}

/** The old lecturer course address now opens the course page on its homework tab. */
export function CourseRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/course/${id}?tab=homework`} replace />;
}
