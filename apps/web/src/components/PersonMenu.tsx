import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsManager } from '../lib/session';

/// Somebody a right-click can be about: enough to find them again elsewhere.
export interface MenuPerson {
  id: string;
  name: string;
}

interface Open {
  person: MenuPerson;
  x: number;
  y: number;
}

/**
 * The menu that opens when you right-click a staff member — on the rota, in the
 * month, in the Directory. `open` goes on an element's `onContextMenu`; render
 * `menu` once on the page.
 *
 * "See schedule" only appears where the page gives it something to do, and the
 * Staff record only for managers.
 */
export function usePersonMenu(options: { onSeeSchedule?: (person: MenuPerson) => void } = {}): {
  open: (event: React.MouseEvent, person: MenuPerson) => void;
  menu: ReactNode;
} {
  const [state, setState] = useState<Open | null>(null);
  const navigate = useNavigate();
  const isManager = useIsManager();
  const ref = useRef<HTMLDivElement>(null);
  const { onSeeSchedule } = options;

  const close = useCallback(() => setState(null), []);

  const open = useCallback((event: React.MouseEvent, person: MenuPerson) => {
    event.preventDefault();
    event.stopPropagation();
    setState({ person, x: event.clientX, y: event.clientY });
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    // Focus the first item so the keyboard can carry on from here.
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [state, close]);

  const items: { label: string; run: () => void }[] = [];
  if (state) {
    const { person } = state;
    items.push({
      label: 'See profile',
      run: () => navigate(`/directory?person=${encodeURIComponent(person.id)}`),
    });
    if (onSeeSchedule) {
      items.push({ label: 'See schedule', run: () => onSeeSchedule(person) });
    }
    if (isManager) {
      items.push({
        label: 'Open in Staff',
        run: () => navigate(`/staff?q=${encodeURIComponent(person.name)}`),
      });
    }
  }

  // Keep the menu on screen when the click was near an edge.
  const left = state ? Math.min(state.x, window.innerWidth - 200) : 0;
  const top = state ? Math.min(state.y, window.innerHeight - 20 - items.length * 40) : 0;

  const menu = state ? (
    <div
      ref={ref}
      role="menu"
      aria-label={`${state.person.name}`}
      data-testid="person-menu"
      style={{ left, top }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const all = Array.from(
          ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
        );
        const at = all.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
        all[(next + all.length) % all.length]?.focus();
      }}
      className="fixed z-50 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
    >
      <p className="truncate px-3 py-1 text-xs font-medium text-slate-500">{state.person.name}</p>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            close();
            item.run();
          }}
          className="block w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-brand-50 focus:bg-brand-50 focus:outline-none"
        >
          {item.label}
        </button>
      ))}
    </div>
  ) : null;

  return { open, menu };
}
