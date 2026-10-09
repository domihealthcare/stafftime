import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { TimeOffClash } from '../lib/types';

/// "Tue, Dec 22", or "Tue, Dec 22 – Fri, Dec 25" for a run of days.
export function clashDays(clash: TimeOffClash): string {
  const day = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  return clash.from === clash.to ? day(clash.from) : `${day(clash.from)} – ${day(clash.to)}`;
}

/// "Ana L, Bea M (asked)".
export function clashPeople(people: TimeOffClash['off']): string {
  return people
    .map(
      (person) =>
        `${person.name}${person.isHalfDay ? ' (half day)' : ''}${person.approved ? '' : ' (asked)'}`,
    )
    .join(', ');
}

/**
 * On a request a manager is deciding: approving it leaves an office short of
 * one job role (October 2026 — too many off at once, seen before the second
 * request is approved rather than after). A warning; Approve still works.
 */
export function ClashNote({
  requestId,
  employeeId,
  compact = false,
}: {
  requestId: string;
  employeeId: string;
  /// Plain amber lines, no box: inside the Schedule's folded request list.
  compact?: boolean;
}) {
  const [clashes, setClashes] = useState<TimeOffClash[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .ptoClashes(requestId)
      .then((found) => !cancelled && setClashes(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (clashes.length === 0) return null;
  return (
    <ul
      className={
        compact
          ? 'text-xs text-amber-900'
          : 'mt-1 space-y-0.5 rounded-md bg-amber-100/70 px-2 py-1 text-xs text-amber-950'
      }
      data-testid="time-off-clash"
    >
      {clashes.map((clash) => {
        const left = clash.total - clash.off.length;
        const others = clash.off.filter((person) => person.employeeId !== employeeId);
        return (
          <li key={`${clash.locationId}-${clash.jobRoleId}-${clash.from}`}>
            ⚠ Approving this leaves {clash.locationName} with{' '}
            {left === 0
              ? `nobody in ${clash.jobRoleName}`
              : `${left} of ${clash.total} in ${clash.jobRoleName}`}{' '}
            on {clashDays(clash)}
            {clash.minimum !== null && <> (minimum {clash.minimum})</>}
            {others.length > 0 && <> — also off: {clashPeople(others)}</>}.
          </li>
        );
      })}
    </ul>
  );
}
