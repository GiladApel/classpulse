import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { pb, useUser } from '../lib/pb';
import { useIsAdmin } from '../lib/useIsAdmin';

/** Every screen except the projector: a dark top bar (back, home, who is signed in, sign-out) over the page content. */
export default function AppShell({ back, wide = false, children }: { back?: string; wide?: boolean; children: ReactNode }) {
  const user = useUser();
  const admin = useIsAdmin();
  const role = user?.role === 'lecturer' ? 'מרצה' : 'סטודנט/ית';

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-30 bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-1">
            {back && (
              <Link to={back} aria-label="חזרה" className="rounded-lg px-2 py-1.5 text-lg leading-none hover:bg-white/10">
                →
              </Link>
            )}
            <Link to="/" className="rounded-lg px-2 py-1.5 font-bold tracking-tight hover:bg-white/10">
              ClassPulse
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-1 text-sm">
            {admin && (
              <Link to="/admin" className="rounded-lg px-2 py-1.5 text-indigo-200 hover:bg-white/10">
                ניהול משתמשים
              </Link>
            )}
            {user && (
              <span className="hidden truncate px-2 text-slate-300 sm:inline">
                {user.name} · {role}
              </span>
            )}
            <button onClick={() => pb.authStore.clear()} className="rounded-lg px-2 py-1.5 hover:bg-white/10">
              יציאה
            </button>
          </div>
        </div>
      </header>
      <main className={`mx-auto flex w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} flex-col gap-4 p-4 md:p-6`}>{children}</main>
    </div>
  );
}
