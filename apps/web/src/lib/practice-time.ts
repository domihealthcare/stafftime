/**
 * Hours on the practice's clock, in New Jersey, whatever the browser's own
 * time zone. For the few places that send the server a bare "HH:MM" for it to
 * read as New Jersey time — the shift pop-up's Hours and place — so a laptop
 * set to another zone cannot move a shift by the difference on every save
 * (October 2026: a browser in UTC moved one 4 hours each time).
 *
 * Mirrors `zoned-time.util.ts` in the API.
 */
export const PRACTICE_ZONE = 'America/New_York';

function partsIn(instant: Date): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRACTICE_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

/// "HH:MM" on the practice's clock.
export function practiceClockOf(iso: string): string {
  const parts = partsIn(new Date(iso));
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/// Minutes the practice's clock is ahead of UTC at `instant` (−240 in summer).
function offsetMinutesAt(instant: Date): number {
  const parts = partsIn(instant);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/// The instant `time` ("HH:MM") falls at on the practice's calendar day of
/// `onDayOf`. Two passes, as the API does, so a clock change is handled.
export function atPracticeTime(onDayOf: string, time: string): string {
  const day = partsIn(new Date(onDayOf));
  const [hour, minute] = time.split(':').map(Number);
  const naive = Date.UTC(day.year, day.month - 1, day.day, hour, minute, 0);
  let instant = new Date(naive - offsetMinutesAt(new Date(naive)) * 60_000);
  instant = new Date(naive - offsetMinutesAt(instant) * 60_000);
  return instant.toISOString();
}
