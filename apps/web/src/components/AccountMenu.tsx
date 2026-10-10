import { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { NavLink } from 'react-router-dom';
import { useIsManager, useSession } from '../lib/session';
import { unsavedWork } from '../lib/unsaved-work';
import { useConfirm } from './ConfirmDialog';
import { useT } from '../lib/i18n';

/**
 * Who you are, and the things that are yours rather than the practice's.
 *
 * These used to sit as four more links beside the navigation, which pushed the
 * header onto a second row and put "Sign out" a stray tap away from "Clock".
 * Behind one button they stay reachable without competing with the screens
 * people actually came for.
 */
export function AccountMenu() {
  const t = useT();
  const { employee, signOut } = useSession();
  const isManager = useIsManager();
  const confirm = useConfirm();
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
        aria-label={t('Your account — {name}', {
          name: `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`,
        }).trim()}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
      >
        {employee && <Avatar person={employee} size="md" />}
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
          className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2">
            {employee && <Avatar person={employee} size="lg" />}
            <div className="min-w-0">
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
          </div>

          <div className="py-1">
            <NavLink to="/profile" role="menuitem" className={item} onClick={() => setOpen(false)}>
              {t('Your profile')}
            </NavLink>
            {/* What is somebody's own lives here with the rest of what is
                theirs (October 2026, when the Team menu went). Licenses and
                onboarding for job roles that keep them (Provider) — a manager
                has them under Manage; productivity once one is published. */}
            {!isManager && employee?.seesOwnPersonnelTabs && (
              <>
                <NavLink
                  to="/credentials"
                  role="menuitem"
                  className={item}
                  onClick={() => setOpen(false)}
                >
                  {t('Your licenses')}
                </NavLink>
                <NavLink
                  to="/checklists"
                  role="menuitem"
                  className={item}
                  onClick={() => setOpen(false)}
                >
                  {t('Your onboarding')}
                </NavLink>
              </>
            )}
            {employee?.hasProductivity && (
              <NavLink
                to="/my-productivity"
                role="menuitem"
                className={item}
                onClick={() => setOpen(false)}
              >
                {t('Your productivity')}
              </NavLink>
            )}
            {isManager && (
              <>
                <NavLink
                  to="/settings"
                  role="menuitem"
                  className={item}
                  onClick={() => setOpen(false)}
                >
                  {t('Practice settings')}
                </NavLink>
                <NavLink
                  to="/notifications"
                  role="menuitem"
                  className={item}
                  onClick={() => setOpen(false)}
                >
                  {t('Email settings')}
                </NavLink>
              </>
            )}
            <NavLink to="/password" role="menuitem" className={item} onClick={() => setOpen(false)}>
              {t('Change password')}
            </NavLink>
            <NavLink to="/help" role="menuitem" className={item} onClick={() => setOpen(false)}>
              {t('Help')}
            </NavLink>
          </div>

          <div className="border-t border-slate-100 pt-1">
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={async () => {
                const unsaved = unsavedWork();
                if (
                  unsaved &&
                  !(await confirm({
                    title: t('Sign out and lose what you have entered?'),
                    body: t(
                      'Signing out clears {what}. It is not saved anywhere, so it cannot be got back.',
                      { what: unsaved },
                    ),
                    confirmLabel: t('Sign out and clear it'),
                    cancelLabel: t('Stay signed in'),
                    tone: 'danger',
                  }))
                ) {
                  return;
                }
                setSigningOut(true);
                try {
                  await signOut();
                } finally {
                  setSigningOut(false);
                }
              }}
              className={`${item} text-rose-700 hover:bg-rose-50 disabled:opacity-60`}
            >
              {signingOut ? t('Signing out…') : t('Sign out')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
