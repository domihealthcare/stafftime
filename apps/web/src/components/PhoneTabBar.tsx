import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { NavIcon } from './NavIcons';
import type { NavMenuItem } from './NavMenu';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${
    isActive ? 'text-brand-700' : 'text-slate-600'
  }`;

/**
 * The phone's navigation: Home, Schedule, Directory and Resources along the
 * bottom, where a thumb reaches, and everything else under **More** —
 * Timesheet, News, Surveys and Manage (October 2026, Dominguez: option B). From `sm` up the
 * header carries the navigation instead — the two are never both on the page,
 * so every link is on the page once.
 */
export function PhoneTabBar({
  pendingPto,
  manageItems,
}: {
  pendingPto: number;
  manageItems: NavMenuItem[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<'Manage' | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Everybody's own entries; Surveys is under Manage for a manager already,
  // and each link is on the page once.
  const plainItems: NavMenuItem[] = [
    { to: '/timesheet', label: 'Timesheet' },
    { to: '/news', label: 'News' },
    ...(manageItems.some((item) => item.to === '/surveys')
      ? []
      : [{ to: '/surveys', label: 'Surveys' }]),
  ];
  const onMoreScreen = [...plainItems, ...manageItems].some(
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

  const groups = [{ name: 'Manage' as const, items: manageItems }].filter(
    (entry) => entry.items.length > 0,
  );

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
            {plainItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-3 text-sm font-medium ${
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                {t(item.label)}
              </NavLink>
            ))}
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
          <NavIcon name="home" size="md" />
          {t('Home')}
        </NavLink>
        <NavLink to="/schedule" className={tabClass}>
          <NavIcon name="schedule" size="md" />
          {t('Schedule')}
          {pendingPto > 0 && (
            <span className="absolute right-3 top-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
              {pendingPto}
            </span>
          )}
        </NavLink>
        <NavLink to="/directory" className={tabClass}>
          <NavIcon name="directory" size="md" />
          {t('Directory')}
        </NavLink>
        <NavLink to="/resources" className={tabClass}>
          <NavIcon name="resources" size="md" />
          {t('Resources')}
        </NavLink>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="more-sheet"
          onClick={() => setOpen((shown) => !shown)}
          className={`${tabClass({ isActive: onMoreScreen })} bg-transparent`}
        >
          <NavIcon name="more" size="md" />
          {t('More')}
        </button>
      </nav>
    </div>
  );
}
