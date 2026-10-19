import { officeShort, KIND_STYLE } from '../lib/calendar-kinds';
import { formatTimeCompact, localDate } from '../lib/format';
import { useT } from '../lib/i18n';
import type { ProviderPlaces as Places } from '../lib/types';

/// "Dr. Dominguez": a provider as the practice's own schedule writes them.
function short(provider: Places['shifts'][number]['provider']): string {
  const doctor = provider.name.startsWith('Dr.');
  const last = provider.lastName;
  return doctor ? `Dr. ${last}` : (provider.preferredName ?? provider.firstName);
}

export interface PlaceGroup {
  key: string;
  label: string;
  people: string[];
}

/// A day's providers by place: each office in turn, then telemedicine. With an
/// office chosen only that office (telemedicine is nobody's office, so stays).
export function placesOn(places: Places, day: string, office: string): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const shift of places.shifts) {
    if (localDate(new Date(shift.startsAt)) !== day) continue;
    if (!shift.isRemote && office && shift.locationId !== office) continue;
    const key = shift.isRemote ? 'TELE' : shift.locationId;
    const group = groups.get(key) ?? {
      key,
      label: shift.isRemote ? 'Tele' : officeShort(shift.locationName),
      people: [],
    };
    group.people.push(
      `${short(shift.provider)} ${formatTimeCompact(shift.startsAt)}-${formatTimeCompact(shift.endsAt)}`,
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
            <strong>{group.key === 'TELE' ? t('Telemedicine') : group.label}</strong>:{' '}
            {group.people.join(', ')}
          </span>
        </span>
      ))}
    </>
  );
}
