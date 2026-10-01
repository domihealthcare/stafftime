import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { TIME_OFF_CHANGED, api } from '../lib/api';
import { AccountMenu } from './AccountMenu';
import { SloganStrip, Wordmark } from './Brand';
import { NavIcon } from './NavIcons';
import { NavMenu } from './NavMenu';
import { PhoneTabBar } from './PhoneTabBar';
import { useIsPhone } from '../lib/use-is-phone';
import { NotificationBell } from './NotificationBell';
import { useIsAdmin, useIsManager, useSession } from '../lib/session';
import { Spinner } from './ui';

/// On a phone each link grows to share out its row, so the text is centred and
/// the padding is small — the row, not the padding, sets the width. From `sm`
/// up they are ordinary inline pills again.
const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1 py-2 text-center text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-0 sm:flex-none sm:justify-start sm:px-3 sm:text-left ${
    isActive
      ? 'bg-brand-50 text-brand-800'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

/// Running the practice. Time off and Surveys joined it when their tabs went
/// (October 2026, Dominguez): staff reach time off from Schedule and Home,
/// and surveys from Home and News.
const MANAGE = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/time-off', label: 'Time off & balances' },
  { to: '/surveys', label: 'Surveys' },
  { to: '/closing', label: 'Closing checklists' },
  { to: '/checklists', label: 'Onboarding & Offboarding' },
  { to: '/credentials', label: 'Licenses' },
  { to: '/job-roles', label: 'Job roles' },
  { to: '/export', label: 'Export' },
];
const PRODUCTIVITY_MANAGE = { to: '/productivity', label: 'Provider productivity' };
const ADMINISTER = [
  { to: '/staff', label: 'Staff' },
  { to: '/kiosks', label: 'Kiosks' },
  { to: '/locations', label: 'Locations' },
];

const APP_NAME = 'Domi Staff';

/// A page change in a single-page app is silent: the tab keeps its old title
/// and a screen reader or keyboard user is left wherever they were. So after
/// each change the tab is named for the screen ("Timesheet · Domi Staff", from
/// its heading, so no page has to say it twice) and focus moves to the content.
/// Screens load lazily, so this waits for the heading to appear.
function useRouteAnnouncer(main: React.RefObject<HTMLElement>) {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    const element = main.current;
    if (!element) return;
    const skipFocus = first.current; // Do not steal focus from the first load.
    first.current = false;
    let done = false;
    const apply = () => {
      const heading = element.querySelector('h1')?.textContent?.trim();
      if (!heading) return false;
      document.title = heading === APP_NAME ? APP_NAME : `${heading} · ${APP_NAME}`;
      if (!skipFocus && !done) element.focus({ preventScroll: true });
      done = true;
      return true;
    };
    if (apply()) return;
    const observer = new MutationObserver(() => apply() && observer.disconnect());
    observer.observe(element, { childList: true, subtree: true });
    const stop = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(stop);
    };
  }, [pathname, main]);
}

export function Layout() {
  const isPhone = useIsPhone();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const { employee } = useSession();
  // What Manage holds — on a laptop in the header, on a phone under More.
  // Somebody's own licenses, onboarding and productivity are in the account
  // menu, with the rest of what is theirs.
  const manageItems = [
    ...(isManager ? MANAGE : []),
    ...(isAdmin ? ADMINISTER : []),
    ...(employee?.canManageProductivity || isAdmin ? [PRODUCTIVITY_MANAGE] : []),
  ];
  const mainRef = useRef<HTMLElement>(null);
  useRouteAnnouncer(mainRef);
  const [pendingPto, setPendingPto] = useState(0);

  // A badge on the tab, so a manager does not have to go looking for requests.
  // Fetched on every screen change, when the app comes back into view, and
  // straight after a request is made, decided or cancelled — once at sign-in
  // was not enough: it went on showing requests already dealt with.
  const { pathname } = useLocation();
  const [ptoGeneration, setPtoGeneration] = useState(0);
  useEffect(() => {
    if (!isManager) return;
    const bump = () => setPtoGeneration((n) => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && bump();
    window.addEventListener(TIME_OFF_CHANGED, bump);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(TIME_OFF_CHANGED, bump);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isManager]);
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
  }, [isManager, pathname, ptoGeneration]);

  return (
    <div className="min-h-screen bg-slate-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-800 focus:shadow-lg focus:ring-2 focus:ring-brand-600"
      >
        Skip to content
      </a>
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

          {/* The everyday screens are links of their own, each with its icon
              (October 2026, Dominguez — option B of three renderings): Home
              first, so a punch is never behind a menu, then Schedule (which
              carries time off and its badge), Timesheet, Directory and
              Resources. News is on Home. What only managers need sits under
              Manage. On a phone the bottom bar takes over (PhoneTabBar).

              `relative` so a menu opens against the nav. */}
          {!isPhone && (
            <nav
              aria-label="Main"
              className="relative col-span-2 flex flex-wrap gap-1 sm:col-span-1 sm:items-center sm:gap-x-0.5 sm:gap-y-1"
            >
              <NavLink to="/" end className={linkClasses}>
                <NavIcon name="home" />
                Home
              </NavLink>
              <NavLink to="/schedule" className={linkClasses}>
                <NavIcon name="schedule" />
                Schedule
                {pendingPto > 0 && (
                  <span
                    className="ml-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800"
                    title={`${pendingPto} time-off request${pendingPto === 1 ? '' : 's'} to decide`}
                  >
                    {pendingPto}
                  </span>
                )}
              </NavLink>
              <NavLink to="/timesheet" className={linkClasses}>
                <NavIcon name="timesheet" />
                Timesheet
              </NavLink>
              <NavLink to="/directory" className={linkClasses}>
                <NavIcon name="directory" />
                Directory
              </NavLink>
              <NavLink to="/resources" className={linkClasses}>
                <NavIcon name="resources" />
                Resources
              </NavLink>
              <NavMenu
                label="Manage"
                icon={<NavIcon name="manage" />}
                items={manageItems}
                className={linkClasses}
              />
            </nav>
          )}
        </div>
      </header>
      <SloganStrip />

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-6 pb-24 focus:outline-none sm:pb-6"
      >
        {/* Screens load when first opened; the header stays while they do. */}
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      {isPhone && <PhoneTabBar pendingPto={pendingPto} manageItems={manageItems} />}
    </div>
  );
}
