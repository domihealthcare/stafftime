import { useId, useMemo, useRef, useState } from 'react';
import { displayName } from '../lib/format';
import { jobRoleHex } from '../lib/job-role-colours';
import type { Employee, JobRole, Location } from '../lib/types';

/**
 * Who an event is for, as Dominguez asked (September 2026): one searchable
 * box where any mix is added — "Providers, Kayla, Angelina" — or Everyone.
 *
 * Type part of a name, a job role or an office; pick it from the list; it
 * becomes a tag with an ✕. Arrow keys and Enter work as well as the mouse,
 * and Backspace in an empty box takes the last tag off.
 */

export interface InviteeSelection {
  everyone: boolean;
  employeeIds: string[];
  jobRoleIds: string[];
  locationIds: string[];
}

export const NOBODY: InviteeSelection = {
  everyone: false,
  employeeIds: [],
  jobRoleIds: [],
  locationIds: [],
};

type Kind = 'EVERYONE' | 'JOB_ROLE' | 'LOCATION' | 'EMPLOYEE';

interface Option {
  kind: Kind;
  id: string;
  label: string;
  hint: string;
  colour?: string;
}

const listFor: Record<Exclude<Kind, 'EVERYONE'>, keyof Omit<InviteeSelection, 'everyone'>> = {
  JOB_ROLE: 'jobRoleIds',
  LOCATION: 'locationIds',
  EMPLOYEE: 'employeeIds',
};

export function InviteePicker({
  id,
  value,
  onChange,
  employees,
  jobRoles,
  locations,
}: {
  id?: string;
  value: InviteeSelection;
  onChange: (next: InviteeSelection) => void;
  employees: Employee[];
  jobRoles: JobRole[];
  locations: Location[];
}) {
  const own = useId();
  const inputId = id ?? `${own}-input`;
  const listId = `${own}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const options = useMemo<Option[]>(() => {
    const rolesOf = (personId: string) =>
      jobRoles.filter((role) => role.members.some((m) => m.id === personId)).map((r) => r.name);
    return [
      { kind: 'EVERYONE', id: 'everyone', label: 'Everyone', hint: 'the whole practice' },
      ...jobRoles.map((role) => ({
        kind: 'JOB_ROLE' as const,
        id: role.id,
        label: role.name,
        hint: `job role · ${role.members.length} ${role.members.length === 1 ? 'person' : 'people'}`,
        colour: role.colour,
      })),
      ...locations.map((location) => ({
        kind: 'LOCATION' as const,
        id: location.id,
        label: location.name,
        hint: 'everybody at this office',
      })),
      ...employees
        .filter((p) => p.employmentStatus === 'ACTIVE' || p.employmentStatus === 'ON_LEAVE')
        .map((person) => ({
          kind: 'EMPLOYEE' as const,
          id: person.id,
          label: displayName(person),
          hint: rolesOf(person.id).join(', ') || 'person',
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [employees, jobRoles, locations]);

  const chosen = (option: Option) =>
    option.kind === 'EVERYONE' ? value.everyone : value[listFor[option.kind]].includes(option.id);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = options
    .filter((option) => !chosen(option))
    .filter((option) => {
      const text = `${option.label} ${option.hint}`.toLowerCase();
      // "provider" finds the role; "kay" finds Kayla; "north" finds the office.
      return words.every((word) => text.includes(word) || text.includes(word.replace(/s$/, '')));
    })
    .slice(0, 8);

  function add(option: Option) {
    if (option.kind === 'EVERYONE') {
      onChange({ ...NOBODY, everyone: true });
    } else {
      const list = listFor[option.kind];
      onChange({ ...value, everyone: false, [list]: [...value[list], option.id] });
    }
    setQuery('');
    setActive(0);
    input.current?.focus();
  }

  function remove(option: Option) {
    if (option.kind === 'EVERYONE') onChange({ ...value, everyone: false });
    else {
      const list = listFor[option.kind];
      onChange({ ...value, [list]: value[list].filter((x) => x !== option.id) });
    }
  }

  const tags = options.filter(chosen);

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
        add(matches[active]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Backspace' && query === '' && tags.length > 0) {
      remove(tags[tags.length - 1]);
    }
  }

  return (
    <div className="relative">
      <div
        className="mt-1 flex min-h-[38px] flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-white px-1.5 py-1 shadow-sm focus-within:border-brand-600 focus-within:ring-1 focus-within:ring-brand-600"
        onClick={() => input.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={`${tag.kind}-${tag.id}`}
            data-testid="invitee-tag"
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs font-medium text-slate-800 ring-1 ring-inset ring-slate-200"
          >
            {tag.colour && (
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: jobRoleHex(tag.colour) }}
              />
            )}
            {tag.label}
            {tag.kind === 'LOCATION' && <span className="font-normal text-slate-500">office</span>}
            <button
              type="button"
              onClick={(click) => {
                click.stopPropagation();
                remove(tag);
              }}
              aria-label={`Remove ${tag.label}`}
              className="rounded-full px-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={inputId}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(change) => {
            setQuery(change.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          // Late enough that a click on an option lands first.
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={tags.length === 0 ? 'Type a name, a job role or an office…' : ''}
          className="min-w-[10rem] flex-1 border-0 p-1 text-sm focus:outline-none focus:ring-0"
        />
      </div>
      {open && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {matches.map((option, index) => (
            <li
              key={`${option.kind}-${option.id}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(mouse) => {
                // Before the input's blur closes the list.
                mouse.preventDefault();
                add(option);
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 ${
                index === active ? 'bg-brand-50 text-brand-900' : 'text-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5 font-medium">
                {option.colour && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: jobRoleHex(option.colour) }}
                  />
                )}
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
