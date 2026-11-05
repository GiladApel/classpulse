import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useUser } from '../lib/pb';

const nextParam = (loc: { pathname: string; search: string }) => `?next=${encodeURIComponent(loc.pathname + loc.search)}`;

export function RequireStudent({ children }: { children: ReactNode }) {
  const user = useUser();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login${nextParam(loc)}`} replace />;
  if (!user.student_id) return <Navigate to={`/onboarding${nextParam(loc)}`} replace />;
  return children;
}

export function RequireLecturer({ children }: { children: ReactNode }) {
  const user = useUser();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login${nextParam(loc)}`} replace />;
  if (user.role !== 'lecturer') return <Navigate to="/" replace />;
  return children;
}
