import type { CalendarKind } from './calendar-kinds';

/// The separate calendars somebody can subscribe to, one kind each - the
/// same list as `FEEDS` in the API's `calendar/feeds.ts`. `domi` is all of
/// them in one.
export const SEPARATE_FEEDS: {
  slug: string;
  label: string;
  kind: CalendarKind | null;
  /// Only worth offering to providers: empty for anybody else.
  providersOnly?: boolean;
  /// Not in the all-in-one calendar, so offered beside it too.
  alongside?: boolean;
}[] = [
  { slug: 'shifts', label: 'My shifts & time off', kind: null },
  { slug: 'diagnostics', label: 'Diagnostics', kind: 'DIAGNOSTIC' },
  { slug: 'phlebotomist', label: 'Phlebotomist', kind: 'PHLEBOTOMY' },
  { slug: 'rep-lunches', label: 'Rep lunches', kind: 'REP_LUNCH' },
  { slug: 'holidays', label: 'Holidays & closures', kind: 'HOLIDAY' },
  { slug: 'pay-days', label: 'Pay days', kind: 'PAY_DAY' },
  { slug: 'events', label: 'Meetings & events', kind: 'EVENT' },
  { slug: 'providers', label: 'Providers', kind: 'PROVIDERS', alongside: true },
  { slug: 'on-call', label: 'My on call', kind: null, providersOnly: true },
];
