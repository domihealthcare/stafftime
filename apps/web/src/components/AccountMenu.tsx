import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useIsManager, useSession } from '../lib/session';

/**
 * Who you are, and the things that are yours rather than the practice's.
 *
 * These used to sit as four more links beside the navigation, which pushed the
 * header onto a second row and put "Sign out" a stray tap away from "Clock".
 * Behind one button they stay reachable without competing with the screens
 * people actually came for.
 */
export function AccountMenu() {
  const { employee, signOut } = useSession();
  const isManager = useIsManager();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // A menu that only closes when you pick something is a menu you are stuck in.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
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

  const name = employee?.preferredName ?? employee?.firstName ?? '';
  const initials = `${employee?.firstName?.[0] ?? ''}${employee?.lastName?.[0] ?? ''}`;

  const item =
    'block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';

  return (
    <div className="relative" ref={menu}>
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-haspopup="menu"
        // The visible name is hidden at phone width and the initials are
        // decorative, which left this button with no accessible name at all —
        // a screen reader announced "button" and nothing else. The label does
        // not depend on the viewport.
        aria-label={`Your account — ${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim()}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
      >
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800"
        >
          {initials}
        </span>
        {/* The name is the useful part on a laptop and the first thing to go on
            a phone, where the initials alone identify who is signed in. */}
        <span className="hidden sm:inline">{name}</span>
        <span aria-hidden className="text-slate-400">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900">
              {employee?.firstName} {employee?.lastName}
            </p>
            <p className="truncate text-xs text-slate-500">{employee?.email}</p>
            {isManager && (
              <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {employee?.role.toLowerCase()}
              </span>
            )}
          </div>

          <div className="py-1">
            {isManager && (
              <>
                <NavLink to="/settings" role="menuitem" className={item} onClick={() => setOpen(false)}>
                  Practice settings
                </NavLink>
                <NavLink
                  to="/notifications"
                  role="menuitem"
                  className={item}
                  onClick={() => setOpen(false)}
                >
                  Notifications
                </NavLink>
              </>
            )}
            <NavLink to="/password" role="menuitem" className={item} onClick={() => setOpen(false)}>
              Change password
            </NavLink>
          </div>

          <div className="border-t border-slate-100 pt-1">
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await signOut();
                } finally {
                  setSigningOut(false);
                }
              }}
              className={`${item} text-rose-700 hover:bg-rose-50 disabled:opacity-60`}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
