import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useIsAdmin, useIsManager, useSession } from '../lib/session';

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function Layout() {
  const { employee, signOut } = useSession();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-1">
            <span className="mr-3 font-semibold text-slate-900">Domi</span>
            <nav className="flex items-center gap-1">
              <NavLink to="/" end className={linkClasses}>
                Clock
              </NavLink>
              <NavLink to="/timesheet" className={linkClasses}>
                Timesheet
              </NavLink>
              <NavLink to="/schedule" className={linkClasses}>
                Schedule
              </NavLink>
              {isAdmin && (
                <NavLink to="/kiosks" className={linkClasses}>
                  Kiosks
                </NavLink>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              {employee?.firstName} {employee?.lastName}
              {isManager && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {employee?.role.toLowerCase()}
                </span>
              )}
            </span>
            <NavLink
              to="/password"
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              Password
            </NavLink>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
