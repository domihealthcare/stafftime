import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { inputClass } from './ui';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A dropdown you can type into (October 2026, Dominguez: the phone book's
 * specialties, then the rep on a rep lunch - "be able to search within that
 * drop down"): the list opens under the box, narrows as you type, and a pick
 * fills the box. With `anyLabel`, its first entry (and an emptied box) means
 * "any". Arrow keys and Enter work; Escape closes. `footer` goes at the
 * bottom of the open list - "+ Add a new rep".
 */
export function SearchableSelect({
  label,
  id: givenId,
  value,
  options,
  anyLabel,
  placeholder,
  onChange,
  footer,
  className = '',
}: {
  label: string;
  id?: string;
  /// The chosen option's value, or '' for none.
  value: string;
  options: SelectOption[] | string[];
  /// What the "any" entry is called ("Every specialty"); none for a choice
  /// that has to be made.
  anyLabel?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  footer?: (close: () => void, typed: string) => ReactNode;
  className?: string;
}) {
  const generated = useId();
  const id = givenId ?? generated;
  const list: SelectOption[] = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );
  const labelOf = (wanted: string) => list.find((option) => option.value === wanted)?.label ?? '';
  const [typed, setTyped] = useState(labelOf(value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  // The box shows what was chosen, until typing starts (and once the options
  // arrive, for a value set before they did).
  const shown = labelOf(value);
  useEffect(() => {
    setTyped(shown);
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setTyped(shown);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open, shown]);

  const needle = typed.trim().toLowerCase();
  const matching =
    needle === '' || needle === shown.toLowerCase()
      ? list
      : list.filter((option) => option.label.toLowerCase().includes(needle));
  const ANY = '\u0000any';
  const entries: SelectOption[] = [
    ...(anyLabel ? [{ value: ANY, label: anyLabel }] : []),
    ...matching,
  ];

  const pick = (entry: SelectOption) => {
    const next = entry.value === ANY ? '' : entry.value;
    onChange(next);
    setTyped(entry.value === ANY ? '' : entry.label);
    setOpen(false);
  };
  const close = () => setOpen(false);

  return (
    <div ref={root} className={`relative ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        value={typed}
        placeholder={placeholder ?? anyLabel}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setTyped(event.target.value);
          setOpen(true);
          setActive(0);
          // Emptying the box means any (or nothing chosen), straight away.
          if (event.target.value.trim() === '' && value !== '') onChange('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((current) => Math.min(current + 1, entries.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            if (!open) return;
            event.preventDefault();
            // Typed exactly one option: that one; else the highlighted entry.
            const exact = list.find((option) => option.label.toLowerCase() === needle);
            const entry = exact ?? entries[active];
            if (entry) pick(entry);
          } else if (event.key === 'Escape') {
            setOpen(false);
            setTyped(shown);
          }
        }}
        className={inputClass}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[14rem] rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
          <ul id={`${id}-list`} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {entries.map((entry, index) => {
              const chosen = entry.value === ANY ? value === '' : entry.value === value;
              return (
                <li
                  key={entry.value}
                  role="option"
                  aria-selected={chosen}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(entry);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={`cursor-pointer px-3 py-1.5 ${
                    index === active ? 'bg-brand-50 text-brand-900' : 'text-slate-800'
                  } ${chosen ? 'font-semibold' : ''} ${entry.value === ANY ? 'italic text-slate-600' : ''}`}
                >
                  {entry.label}
                </li>
              );
            })}
            {matching.length === 0 && (
              <li className="px-3 py-1.5 text-slate-500">Nothing matches that.</li>
            )}
          </ul>
          {footer && (
            <div
              className="border-t border-slate-100 p-1"
              onMouseDown={(event) => event.preventDefault()}
            >
              {footer(close, typed)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
