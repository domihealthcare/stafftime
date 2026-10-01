/// Dates on the form are YYYY-MM-DD strings, as a date input gives them.

/// The day number (days since 1 January 1970) of a real calendar date, or null
/// for anything else — "2026-02-30" included.
export function dayNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || !new Date(time).toISOString().startsWith(value)) return null;
  return Math.round(time / 86_400_000);
}

/// "09/29/2026" — how dates are written on the note.
export function usDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
}

/// "09/29/2026 2:14 PM ET", in the practice's time, for the PDF's stamps.
export function practiceTimestamp(at: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}/${parts.day}/${parts.year} ${parts.hour}:${parts.minute} ${parts.dayPeriod} ET`;
}

const MONTHS = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  // needs native-speaker review
  es: [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ],
};

/// "September 29, 2026" / "29 de septiembre de 2026" — spelled out, so
/// nobody has to guess which number is the month.
export function longDate(iso: string, language: 'en' | 'es'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const name = MONTHS[language][Number(month) - 1];
  return language === 'es'
    ? `${Number(day)} de ${name} de ${year}`
    : `${name} ${Number(day)}, ${year}`;
}
