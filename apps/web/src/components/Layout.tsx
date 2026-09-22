import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import { AccountMenu } from './AccountMenu';
import { NavMenu } from './NavMenu';
import { useIsAdmin, useIsManager } from '../lib/session';

/// On a phone each link is a cell in an even grid, so the text is centred and
/// the padding is small — the cell, not the padding, sets the width. From `sm`
/// up they are ordinary inline pills again.
const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg px-1 py-2 text-center text-sm font-medium transition sm:px-3 sm:text-left ${
    isActive
      ? 'bg-brand-50 text-brand-800'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

/// The practice's shared screens: what is going on, who is here, and where
/// things are.
const TEAM = [
  { to: '/news', label: 'News' },
  { to: '/directory', label: 'Directory' },
  { to: '/resources', label: 'Resources' },
];

/// Running the practice.
const MANAGE = [
  { to: '/job-roles', label: 'Job roles' },
  { to: '/export', label: 'Export' },
];
const ADMINISTER = [
  { to: '/staff', label: 'Staff' },
  { to: '/kiosks', label: 'Kiosks' },
  { to: '/locations', label: 'Locations' },
];

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
        {/* One layout, two shapes, and every element appears exactly once so
            that a link or the account button is never ambiguous to a test or a
            screen reader.

            On a phone this is a two-column grid: brand and account share the
            top row, and the nav spans the full width beneath them. Letting the
            links free-wrap next to the account instead gave three ragged rows
            two pixels apart, ending at x=260, x=299 and then a lone "Export" —
            163px of header, a fifth of the screen, on the app people open
            standing at the front desk.

            From `sm` up it is a single flex row again — brand, nav, then the
            account pushed right — which already fitted on one line. */}
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2 px-4 py-3 sm:flex sm:justify-start sm:gap-3">
          <span className="font-semibold text-slate-900">Domi</span>

          {/* Second in the DOM so it lands in the grid's top-right cell; sent
              to the end of the flex row on wider screens. */}
          <div className="shrink-0 sm:order-last sm:ml-auto">
            <AccountMenu />
          </div>

          {/* The everyday screens are links of their own, in an even grid on
              a phone so they line up in columns instead of ending wherever the
              words stop. The practice-wide ones sit under Team and Manage:
              laid out flat, an admin's fifteen destinations would fill a
              phone's first screen before the page even started. The Clock
              link is always first, so a punch is never behind a menu.

              The column count is computed, not fixed: a hard `grid-cols-4`
              fitted a 390px phone and then clipped "Timesheet" and pushed the
              whole page into horizontal scroll on a 320px one. `auto-fit` with
              a 5.25rem floor drops to three columns there instead.

              `relative` so that on a phone a menu opens across the whole nav,
              wherever in the grid its button landed. */}
          <nav className="relative col-span-2 grid grid-cols-[repeat(auto-fit,minmax(5.25rem,1fr))] gap-1 sm:col-span-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-1 sm:gap-y-1">
            <NavLink to="/" end className={linkClasses}>
              Clock
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
            <NavMenu label="Team" items={TEAM} className={linkClasses} />
            <NavMenu
              label="Manage"
              items={[...(isManager ? MANAGE : []), ...(isAdmin ? ADMINISTER : [])]}
              className={linkClasses}
            />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
