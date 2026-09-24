import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export interface NavMenuItem {
  to: string;
  label: string;
}

/**
 * A heading in the top bar that opens a short list of screens.
 *
 * A disclosure rather than an ARIA menu on purpose: the items are ordinary
 * links, so they read and behave as links — to a screen reader, and to the
 * browser suites — and only their visibility changes.
 */
export function NavMenu({
  label,
  items,
  className,
}: {
  label: string;
  items: NavMenuItem[];
  className: (state: { isActive: boolean }) => string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Highlighted when you are on one of its screens, like any other tab.
  const isActive = items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

  // Picking a screen closes it; so does anywhere else, or Escape.
  useEffect(() => setOpen(false), [pathname]);
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

  if (items.length === 0) return null;

  return (
    // Positioned against the nav on a phone, so the list spans its width and
    // cannot run off either edge; against its own button from `sm` up.
    <div className="flex flex-auto sm:relative sm:block sm:flex-none" ref={container}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
        className={`w-full sm:w-auto ${className({ isActive })}`}
      >
        {label}
        <span aria-hidden className="ml-1 text-slate-400">
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute inset-x-0 z-20 mt-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg sm:inset-x-auto sm:left-0 sm:w-48">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive: here }) =>
                `block rounded-lg px-3 py-2 text-sm ${
                  here ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
