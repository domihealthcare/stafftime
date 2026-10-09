import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/// One line of the menu: "Add a shift".
export interface ContextMenuItem {
  label: string;
  run: () => void;
}

interface Open {
  title: string;
  items: ContextMenuItem[];
  x: number;
  y: number;
}

/**
 * A right-click menu for a place on the page — a day on the rota or in the
 * month (October 2026, Dominguez: "is there a way a right click mechanism can
 * be used for adding shifts / time off / events"). `open` goes on an
 * element's `onContextMenu`; render `menu` once on the page. Escape, a click
 * elsewhere, scrolling or resizing closes it; the arrow keys move through it.
 *
 * The keyboard's own menu key (or Shift+F10) fires the same event with no
 * pointer position, so the menu then opens at the element instead.
 */
export function useContextMenu(): {
  open: (event: React.MouseEvent, title: string, items: ContextMenuItem[]) => void;
  menu: ReactNode;
} {
  const [state, setState] = useState<Open | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setState(null), []);

  const open = useCallback((event: React.MouseEvent, title: string, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    let { clientX: x, clientY: y } = event;
    if (x === 0 && y === 0) {
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      x = box.left + 8;
      y = box.top + 8;
    }
    setState({ title, items, x, y });
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    // A scroll in the first moment is the page settling (a notice going, the
    // rota reloading), not the person moving on — it used to close the menu
    // as it opened.
    const openedAt = Date.now();
    const onScroll = () => Date.now() - openedAt > 300 && close();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [state, close]);

  // Keep the menu on screen when the click was near an edge.
  const left = state ? Math.max(4, Math.min(state.x, window.innerWidth - 230)) : 0;
  const top = state
    ? Math.max(4, Math.min(state.y, window.innerHeight - 44 - state.items.length * 40))
    : 0;

  const menu = state ? (
    <div
      ref={ref}
      role="menu"
      aria-label={state.title}
      data-testid="context-menu"
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
      className="fixed z-50 min-w-[13rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
    >
      <p className="truncate px-3 py-1 text-xs font-medium text-slate-500">{state.title}</p>
      {state.items.map((item) => (
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
