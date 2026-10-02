import { useId, useState, type ReactNode } from 'react';

/**
 * A word or name that shows a short note when you point at it — or tap it on a
 * phone, where there is no pointing, or reach it with the keyboard. For detail
 * that is handy but would crowd the line, like somebody's hours (Dominguez,
 * October 2026: "when you hover over the name, it shows the shift timing").
 *
 * The note is in the page all along, tied to the name for screen readers, so
 * nothing depends on the hover.
 */
export function HoverNote({
  children,
  note,
  testId,
}: {
  children: ReactNode;
  note: ReactNode;
  testId?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((shown) => !shown);
          }
        }}
        className="cursor-help underline decoration-slate-400 decoration-dotted underline-offset-2"
        data-testid={testId}
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className={`absolute left-0 top-full z-20 mt-1 w-max max-w-[16rem] rounded-md bg-slate-900 px-2 py-1 text-xs font-normal text-white shadow-lg ${
          open ? '' : 'sr-only'
        }`}
      >
        {note}
      </span>
    </span>
  );
}
