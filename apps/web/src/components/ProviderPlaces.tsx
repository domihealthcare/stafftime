import { officeShort, KIND_STYLE, TELEMEDICINE } from '../lib/calendar-kinds';
import { formatTimeCompact, localDate } from '../lib/format';
import { useT } from '../lib/i18n';
import type { ProviderPlaces as Places } from '../lib/types';

export interface PlaceGroup {
  key: string;
  label: string;
  people: string[];
}

/// A day's providers by place: each office in turn, then telemedicine. With an
/// office chosen only that office, and with Telemedicine chosen only
/// telemedicine (October 2026, Dominguez: North Bergen had shown telemedicine
/// with it).
export function placesOn(places: Places, day: string, office: string): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const shift of places.shifts) {
    if (localDate(new Date(shift.startsAt)) !== day) continue;
    if (
      office === TELEMEDICINE
        ? !shift.isRemote
        : office && (shift.isRemote || shift.locationId !== office)
    ) {
      continue;
    }
    const key = shift.isRemote ? 'TELE' : shift.locationId;
    const group = groups.get(key) ?? {
      key,
      label: shift.isRemote ? 'Tele' : officeShort(shift.locationName),
      people: [],
    };
    // "Dr. Hernandez", or "Dr. J Dominguez" where two share a name: worked
    // out by the server over every provider (`calendar/provider-labels.ts`).
    group.people.push(
      `${shift.label} ${formatTimeCompact(shift.startsAt)}-${formatTimeCompact(shift.endsAt)}`,
    );
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.key === 'TELE' ? 1 : b.key === 'TELE' ? -1 : a.label.localeCompare(b.label),
  );
}

/**
 * Which providers are at each office and on telemedicine, on the Calendar
 * (October 2026, Dominguez: "so staff know what offices are open and who
 * should be there and who's scheduled to be on telemedicine"). From the
 * published shifts of people in a provider job role: names, offices and
 * hours only. Closures show beside it as they always do.
 *
 * The place on a line of its own, then each provider on a line of their own
 * (October 2026, Dominguez), not run together with commas.
 */
export function ProviderDayChips({
  groups,
  compact = false,
}: {
  groups: PlaceGroup[];
  compact?: boolean;
}) {
  const t = useT();
  const style = KIND_STYLE.PROVIDERS;
  return (
    <>
      {groups.map((group) => (
        <span
          key={group.key}
          data-testid="provider-place"
          className={`block rounded-md px-1.5 py-1 text-xs font-medium leading-tight ring-1 ring-inset ${style.chip}`}
        >
          <span aria-hidden="true">{style.emoji}</span>
          <span className={compact ? 'sr-only' : undefined}>
            {' '}
            <strong>{group.key === 'TELE' ? t('Telemedicine') : group.label}:</strong>
            {group.people.map((person, index) => (
              <span key={index} className="block" data-testid="provider-line">
                {person}
              </span>
            ))}
          </span>
        </span>
      ))}
    </>
  );
}
