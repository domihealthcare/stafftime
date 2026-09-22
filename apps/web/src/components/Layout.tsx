import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import { AccountMenu } from './AccountMenu';
import { useIsAdmin, useIsManager } from '../lib/session';

/// Tighter padding on a phone, so more of the nav fits per row before it wraps.
const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition sm:px-3 ${
    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function Layout() {
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const [pendingPto, setPendingPto] = useState(0);

  // A badge on the tab, so a manager does not have to go looking for requests.
  useEffect(() => {
    if (!isManager) {
      return;
    }
    let cancelled = false;
    api
      .ptoPendingCount()
      .then((result) => !cancelled && setPendingPto(result.pending))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isManager]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        {/* Two columns, and the outer row deliberately does not wrap: the
            navigation wraps *inside* its own column while the account menu
            stays pinned to the top right. Letting the whole row wrap put the
            account on a second line at the left — which is both worse to reach
            and, because the dropdown is right-aligned, pushed the menu off the
            left edge of a phone screen entirely. */}
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-2 px-4 py-3">
          {/* Everything here wraps. An admin has nine destinations, which do
              not fit on one line on a phone — and this app is used on phones,
              standing at the front desk. Wrapping keeps every screen one tap
              away rather than hiding half of them behind a menu. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
            <span className="mr-1 font-semibold text-slate-900 sm:mr-3">Domi</span>
            <nav className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <NavLink to="/" end className={linkClasses}>
                Clock
              </NavLink>
              <NavLink to="/news" className={linkClasses}>
                News
              </NavLink>
              <NavLink to="/timesheet" className={linkClasses}>
                Timesheet
              </NavLink>
              <NavLink to="/schedule" className={linkClasses}>
                Schedule
              </NavLink>
              <NavLink to="/time-off" className={linkClasses}>
                Time off
                {pendingPto > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                    {pendingPto}
                  </span>
                )}
              </NavLink>
              <NavLink to="/checklists" className={linkClasses}>
                Checklists
              </NavLink>
              <NavLink to="/credentials" className={linkClasses}>
                Licences
              </NavLink>
              {isManager && (
                <NavLink to="/export" className={linkClasses}>
                  Export
                </NavLink>
              )}
              {isAdmin && (
                <>
                  <NavLink to="/staff" className={linkClasses}>
                    Staff
                  </NavLink>
                  <NavLink to="/kiosks" className={linkClasses}>
                    Kiosks
                  </NavLink>
                  <NavLink to="/locations" className={linkClasses}>
                    Locations
                  </NavLink>
                </>
              )}
            </nav>
          </div>

          <div className="shrink-0">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
