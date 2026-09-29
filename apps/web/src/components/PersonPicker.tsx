import { useId, useMemo, useRef, useState } from 'react';
import { displayName } from '../lib/format';
import type { Employee, JobRole } from '../lib/types';

/**
 * One person, or everyone — a dropdown you can type into (Dominguez,
 * September 2026: the Schedule's month view, to see one person's month).
 *
 * Closed, it reads as the person chosen, or "Everyone". Open, typing part of
 * a name or a job role narrows the list; arrow keys and Enter work as well as
 * the mouse, Escape closes it, and ✕ goes back to everyone.
 */
export function PersonPicker({
  label,
  value,
  onChange,
  employees,
  jobRoles,
}: {
  /// What the box is for, read out by screen readers.
  label: string;
  /// The chosen person's id, or '' for everyone.
  value: string;
  onChange: (employeeId: string) => void;
  employees: Employee[];
  jobRoles: JobRole[];
}) {
  const own = useId();
  const listId = `${own}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const people = useMemo(() => {
    const rolesOf = (personId: string) =>
      jobRoles.filter((role) => role.members.some((m) => m.id === personId)).map((r) => r.name);
    return employees
      .map((person) => ({
        id: person.id,
        label: displayName(person),
        hint: rolesOf(person.id).join(', '),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employees, jobRoles]);

  const chosen = people.find((person) => person.id === value) ?? null;

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [
    // Everyone is always there to go back to, unless a name is being typed.
    ...(words.length === 0 ? [{ id: '', label: 'Everyone', hint: 'the whole practice' }] : []),
    ...people.filter((person) => {
      const text = `${person.label} ${person.hint}`.toLowerCase();
      return words.every((word) => text.includes(word));
    }),
  ];

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
    setActive(0);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && matches[active]) {
        event.preventDefault();
        pick(matches[active].id);
        input.current?.blur();
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div className="relative w-full sm:w-64">
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        // Open, the box is for typing; closed, it says who is shown.
        value={open ? query : (chosen?.label ?? '')}
        placeholder={open ? 'Type a name or a job role…' : 'Everyone'}
        onChange={(change) => {
          setQuery(change.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setQuery('');
          setOpen(true);
          setActive(0);
        }}
        onClick={() => setOpen(true)}
        // Late enough that a click on an option lands first.
        onBlur={() =>
          window.setTimeout(() => {
            setOpen(false);
            setQuery('');
          }, 150)
        }
        onKeyDown={onKeyDown}
        className={`w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-2 text-sm placeholder:text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 focus:placeholder:text-slate-400 ${
          chosen ? 'pr-14' : 'pr-7'
        }`}
      />
      {chosen && !open && (
        <button
          type="button"
          onClick={() => pick('')}
          aria-label="Show everyone"
          className="absolute right-7 top-1/2 -translate-y-1/2 rounded-full px-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          ✕
        </button>
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500"
      >
        ▾
      </span>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg sm:w-80"
        >
          {matches.length === 0 && (
            <li className="px-3 py-1.5 text-slate-500">Nobody by that name.</li>
          )}
          {matches.map((option, index) => (
            <li
              key={option.id || 'everyone'}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.id === value}
              onMouseDown={(mouse) => {
                // Before the input's blur closes the list.
                mouse.preventDefault();
                pick(option.id);
                input.current?.blur();
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 ${
                index === active ? 'bg-brand-50 text-brand-900' : 'text-slate-800'
              }`}
            >
              <span className={option.id === value ? 'font-semibold' : 'font-medium'}>
                {option.id === value && <span aria-hidden="true">✓ </span>}
                {option.label}
              </span>
              <span className="truncate text-xs text-slate-500">{option.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
