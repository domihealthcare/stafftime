import { useEffect, useState } from 'react';
import { api } from './api';
import { addCalendarDays } from './dates';
import { practiceDate, practiceMidnight } from './practice-time';
import type { PracticeEvent } from './types';

/**
 * Students and residents on rotation with a provider (November 2026,
 * Dominguez). They are practice calendar entries of kind ROTATION, which
 * everybody can read, so Home and the Directory ask for them the same way
 * the Calendar does.
 */

/// Student rotations from today for `days` days, soonest first. Fails
/// quietly: the cards are whole without them.
export function useRotations(days: number): PracticeEvent[] | null {
  const [rotations, setRotations] = useState<PracticeEvent[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const today = practiceDate();
    api
      .events(practiceMidnight(today), practiceMidnight(addCalendarDays(today, days)))
      .then((events) => {
        if (cancelled) return;
        setRotations(
          events
            .filter((event) => event.kind === 'ROTATION')
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        );
      })
      .catch(() => !cancelled && setRotations([]));
    return () => {
      cancelled = true;
    };
  }, [days]);
  return rotations;
}

/// Today's student rotations by provider id, for the Directory and Staff
/// cards.
export function useTodaysRotations(): Map<string, PracticeEvent[]> {
  const rotations = useRotations(1);
  const byProvider = new Map<string, PracticeEvent[]>();
  for (const rotation of rotations ?? []) {
    const id = rotation.provider?.id;
    if (!id) continue;
    byProvider.set(id, [...(byProvider.get(id) ?? []), rotation]);
  }
  return byProvider;
}
