import { useEffect, useId, useRef, useState } from 'react';
import { inputClass } from './ui';

/**
 * A dropdown you can type into (October 2026, Dominguez: the phone book's
 * specialties - "be able to search within that drop down"): the list opens
 * under the box, narrows as you type, and a pick fills the box. Clearing the
 * box, or picking the first entry, means "any". Arrow keys and Enter work;
 * Escape closes. Plain HTML, so it works on a phone and with a screen reader.
 */
export function SearchableSelect({
  label,
  id: givenId,
  value,
  options,
  anyLabel,
  onChange,
  className = '',
}: {
  label: string;
  id?: string;
  /// The chosen option, or '' for any.
  value: string;
  options: string[];
  /// What the "any" entry is called: "Every specialty".
  anyLabel: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const generated = useId();
  const id = givenId ?? generated;
  const [typed, setTyped] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  // The box shows what was chosen, until typing starts.
  useEffect(() => {
    setTyped(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setTyped(value);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open, value]);

  const needle = typed.trim().toLowerCase();
  const matching =
    needle === '' || needle === value.toLowerCase()
      ? options
      : options.filter((option) => option.toLowerCase().includes(needle));
  const entries = [anyLabel, ...matching];

  const pick = (entry: string) => {
    const next = entry === anyLabel ? '' : entry;
    onChange(next);
    setTyped(next);
    setOpen(false);
  };

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
        placeholder={anyLabel}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setTyped(event.target.value);
          setOpen(true);
          setActive(0);
          // Emptying the box means any, straight away.
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
            // Typed exactly one specialty: that one; else the highlighted entry.
            const exact = options.find((option) => option.toLowerCase() === needle);
            pick(exact ?? entries[active] ?? anyLabel);
          } else if (event.key === 'Escape') {
            setOpen(false);
            setTyped(value);
          }
        }}
        className={inputClass}
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full min-w-[14rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {entries.map((entry, index) => {
            const chosen = entry === anyLabel ? value === '' : entry === value;
            return (
              <li
                key={entry}
                role="option"
                aria-selected={chosen}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(entry);
                }}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-1.5 ${
                  index === active ? 'bg-brand-50 text-brand-900' : 'text-slate-800'
                } ${chosen ? 'font-semibold' : ''} ${entry === anyLabel ? 'italic text-slate-600' : ''}`}
              >
                {entry}
              </li>
            );
          })}
          {matching.length === 0 && (
            <li className="px-3 py-1.5 text-slate-500">No specialty matches that.</li>
          )}
        </ul>
      )}
    </div>
  );
}
