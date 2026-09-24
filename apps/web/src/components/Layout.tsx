import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import { AccountMenu } from './AccountMenu';
import { Wordmark } from './Brand';
import { NavMenu } from './NavMenu';
import { NotificationBell } from './NotificationBell';
import { useIsAdmin, useIsManager, useSession } from '../lib/session';

/// On a phone each link grows to share out its row, so the text is centred and
/// the padding is small — the row, not the padding, sets the width. From `sm`
/// up they are ordinary inline pills again.
const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `flex-auto whitespace-nowrap rounded-lg px-1 py-2 text-center text-sm font-medium transition sm:flex-none sm:px-3 sm:text-left ${
    isActive
      ? 'bg-brand-50 text-brand-800'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

/// The practice's shared screens: who is here, and where things are. News has
/// its own tab in the bar (asked for by Dominguez, September 2026).
const TEAM = [
  { to: '/directory', label: 'Directory' },
  { to: '/resources', label: 'Resources' },
  { to: '/surveys', label: 'Surveys' },
];

/// Running the practice.
const MANAGE = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/closing', label: 'Closing checklists' },
  { to: '/checklists', label: 'Onboarding & Offboarding' },
  { to: '/credentials', label: 'Licenses' },
  { to: '/job-roles', label: 'Job roles' },
  { to: '/export', label: 'Export' },
];
/// Their own licenses and onboarding, for people whose job role keeps them
/// (Providers). Front Desk and MAs do not see these at all — decided with
/// Dominguez, September 2026; a manager keeps theirs.
const OWN_PERSONNEL = [
  { to: '/credentials', label: 'Your licenses' },
  { to: '/checklists', label: 'Your onboarding' },
];
const ADMINISTER = [
  { to: '/staff', label: 'Staff' },
  { to: '/kiosks', label: 'Kiosks' },
  { to: '/locations', label: 'Locations' },
];

export function Layout() {
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const { employee } = useSession();
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
      <header className="border-b border-slate-200 border-t-4 border-t-brand-600 bg-white">
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
          <Link
            to="/"
            className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <Wordmark />
          </Link>

          {/* Second in the DOM so it lands in the grid's top-right cell; sent
              to the end of the flex row on wider screens. The bell sits just
              before the account, as it does in most apps people already use. */}
          <div className="relative flex shrink-0 items-center gap-1 sm:order-last sm:ml-auto">
            <NotificationBell />
            <AccountMenu />
          </div>

          {/* The everyday screens are links of their own. The practice-wide
              ones sit under Team and Manage: laid out flat, an admin's fifteen
              destinations would fill a phone's first screen before the page
              even started. The Clock link is always first, so a punch is never
              behind a menu.

              On a phone the links wrap onto rows and each grows to share out
              its row, so every row runs edge to edge instead of ending wherever
              the words stop. This was an even grid of equal columns until News
              became a tab of its own: nine equal cells need three rows at 390px,
              but the words themselves fit in two (about 330px and 290px of the
              358 available) once each is only as wide as it needs to be. On a
              320px phone it drops to three rows rather than clipping a word.

              `relative` so that on a phone a menu opens across the whole nav,
              wherever its button landed. */}
          <nav className="relative col-span-2 flex flex-wrap gap-1 sm:col-span-1 sm:items-center sm:gap-x-1 sm:gap-y-1">
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
            <NavMenu
              label="Team"
              items={[
                ...TEAM,
                ...(!isManager && employee?.seesOwnPersonnelTabs ? OWN_PERSONNEL : []),
              ]}
              className={linkClasses}
            />
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
