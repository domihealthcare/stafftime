import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { NavMenuItem } from './NavMenu';

/// Small line icons, drawn here so the bar needs no icon library.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  clock: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  ),
  schedule: (
    <Icon>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </Icon>
  ),
  timesheet: (
    <Icon>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </Icon>
  ),
  timeOff: (
    <Icon>
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      <circle cx="12" cy="12" r="3.5" />
    </Icon>
  ),
  more: (
    <Icon>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </Icon>
  ),
};

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${
    isActive ? 'text-brand-700' : 'text-slate-600'
  }`;

/**
 * The phone's navigation: the five things people open most along the bottom,
 * where a thumb reaches, and everything else under **More**. From `sm` up the
 * header carries the navigation instead — the two are never both on the page,
 * so every link is on the page once.
 */
export function PhoneTabBar({
  pendingPto,
  teamItems,
  manageItems,
}: {
  pendingPto: number;
  teamItems: NavMenuItem[];
  manageItems: NavMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<'Team' | 'Manage' | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  const onMoreScreen = [...teamItems, ...manageItems, { to: '/news', label: 'News' }].some(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );

  // Picking a screen closes the sheet; so does a tap elsewhere, or Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  // Closed, it forgets which group was open, so the next time starts tidy.
  useEffect(() => {
    if (!open) setGroup(null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const groups = [
    { name: 'Team' as const, items: teamItems },
    { name: 'Manage' as const, items: manageItems },
  ].filter((entry) => entry.items.length > 0);

  return (
    <div
      ref={container}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_6px_rgba(15,23,42,0.06)]"
    >
      <nav aria-label="Main" className="relative mx-auto flex max-w-md">
        {open && (
          <div
            id="more-sheet"
            className="absolute inset-x-2 bottom-full mb-2 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          >
            <NavLink
              to="/news"
              className={({ isActive }) =>
                `block rounded-lg px-3 py-3 text-sm font-medium ${
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100'
                }`
              }
            >
              News
            </NavLink>
            {groups.map((entry) => (
              <div key={entry.name}>
                <button
                  type="button"
                  aria-expanded={group === entry.name}
                  onClick={() =>
                    setGroup((current) => (current === entry.name ? null : entry.name))
                  }
                  className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {entry.name}
                  <span aria-hidden="true" className="text-slate-500">
                    {group === entry.name ? '▴' : '▾'}
                  </span>
                </button>
                {group === entry.name && (
                  <div className="mb-1 ml-3 border-l border-slate-200 pl-1">
                    {entry.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `block rounded-lg px-3 py-3 text-sm ${
                            isActive
                              ? 'bg-brand-50 text-brand-800'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <NavLink to="/" end className={tabClass}>
          {ICONS.clock}
          Clock
        </NavLink>
        <NavLink to="/schedule" className={tabClass}>
          {ICONS.schedule}
          Schedule
        </NavLink>
        <NavLink to="/timesheet" className={tabClass}>
          {ICONS.timesheet}
          Timesheet
        </NavLink>
        <NavLink to="/time-off" className={tabClass}>
          {ICONS.timeOff}
          Time off
          {pendingPto > 0 && (
            <span className="absolute right-3 top-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
              {pendingPto}
            </span>
          )}
        </NavLink>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="more-sheet"
          onClick={() => setOpen((shown) => !shown)}
          className={`${tabClass({ isActive: onMoreScreen })} bg-transparent`}
        >
          {ICONS.more}
          More
        </button>
      </nav>
    </div>
  );
}
