import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatClock } from '../lib/format';
import type { Location, UsualShift } from '../lib/types';

/**
 * Smarter starting hours (October 2026, Dominguez — making the app smarter):
 * a new shift for somebody starts on their usual for that day — their regular
 * shift, or the hours and place they have worked most often lately — rather
 * than 9 to 5. The rule is the server's (`shifts/usual-hours.ts`); the forms
 * only fill it in, and only until the manager changes the times themselves.
 */
export function useUsualShift(employeeId: string | null, date: string | null): UsualShift | null {
  const [usual, setUsual] = useState<UsualShift | null>(null);
  useEffect(() => {
    setUsual(null);
    if (!employeeId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let cancelled = false;
    api
      .usualShift(employeeId, date)
      .then((result) => !cancelled && setUsual(result.usual))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [employeeId, date]);
  return usual;
}

const FROM: Record<UsualShift['from'], string> = {
  regular: 'their regular shift',
  weekday: 'what they have worked most on this weekday lately',
  recent: 'what they have worked most lately',
};

/// "Started on 7:00 AM–3:00 PM at West New York — their regular shift."
export function UsualShiftHint({ usual, locations }: { usual: UsualShift; locations: Location[] }) {
  const where = usual.isRemote
    ? 'working from home'
    : `at ${locations.find((location) => location.id === usual.locationId)?.name ?? 'their office'}`;
  return (
    <p data-testid="usual-shift-hint" role="note" className="text-xs text-slate-600">
      Started on {formatClock(usual.startTime)}–{formatClock(usual.endTime)} {where} —{' '}
      {FROM[usual.from]}.
    </p>
  );
}
