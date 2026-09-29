import type { Employee, Location } from '../lib/types';

/// The value the Location list uses for "Work from home".
export const WORK_FROM_HOME = 'wfh';

/**
 * Which office a work-from-home shift is counted under, for reports and the
 * payroll export: the person's main office, or their first. Staff never see
 * it — the rota says "Work from home" — but every shift belongs to an office,
 * so the rota's office view, the dashboard and the export still add up.
 */
export function homeOfficeOf(person: Pick<Employee, 'locations'> | undefined): string {
  if (!person) return '';
  return (
    person.locations.find((assignment) => assignment.isPrimary)?.locationId ??
    person.locations[0]?.locationId ??
    ''
  );
}

/**
 * Where a shift is: one of the offices, or — for a shift with somebody on it —
 * Work from home (Dominguez, September 2026). It replaced a "Work from home"
 * tick box next to an office list, which made a manager pick an office for a
 * shift that was not at one.
 *
 * `value` is an office id or WORK_FROM_HOME. Turn it back into what the API
 * wants with `placeToShift`.
 */
export function PlaceSelect({
  id,
  value,
  onChange,
  offices,
  allowHome,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  offices: Location[];
  /// Only a shift for a person can be worked from home; an open shift is a
  /// slot an office needs covered.
  allowHome: boolean;
  className: string;
}) {
  return (
    <select
      id={id}
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      {offices.map((office) => (
        <option key={office.id} value={office.id}>
          {office.name}
        </option>
      ))}
      {allowHome && <option value={WORK_FROM_HOME}>Work from home</option>}
    </select>
  );
}

/// The office and work-from-home flag the API wants for a chosen place.
export function placeToShift(
  place: string,
  homeOffice: string,
): { locationId: string; isRemote: boolean } {
  return place === WORK_FROM_HOME
    ? { locationId: homeOffice, isRemote: true }
    : { locationId: place, isRemote: false };
}

/// Said under the list when Work from home is chosen.
export function WorkFromHomeNote() {
  return (
    <p className="mt-1 text-xs text-slate-500">
      They can clock in from anywhere during it; no location is recorded.
    </p>
  );
}
