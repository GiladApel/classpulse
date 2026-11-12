import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { useUser } from '../lib/pb';

const nextParam = (loc: { pathname: string; search: string }) => `?next=${encodeURIComponent(loc.pathname + loc.search)}`;

export function RequireStudent({ children }: { children: ReactNode }) {
  const user = useUser();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login${nextParam(loc)}`} replace />;
  if (!user.student_id) return <Navigate to={`/onboarding${nextParam(loc)}`} replace />;
  return children;
}

/** Any signed-in user; a student must have entered their student ID first. */
export function RequireSignedIn({ children }: { children: ReactNode }) {
  const user = useUser();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login${nextParam(loc)}`} replace />;
  if (user.role !== 'lecturer' && !user.student_id) return <Navigate to={`/onboarding${nextParam(loc)}`} replace />;
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
