import { PracticeEventKind } from '@prisma/client';

/// What can go in a calendar feed.
export type FeedPart = 'SHIFTS' | 'TIME_OFF' | 'PAY_DAYS' | PracticeEventKind;

export interface Feed {
  /// The calendar's name on the phone, after the person's name.
  name: string;
  parts: FeedPart[];
}

/**
 * The calendars somebody can subscribe to (October 2026, Dominguez: separate
 * subscriptions). `domi` is everything in one, the link people already have;
 * the rest are one kind each, so a phone shows them as separate calendars,
 * each with its own colour and its own on/off.
 *
 * The slug is the file name in the address: `/api/calendar/<token>/<slug>.ics`.
 */
export const FEEDS: Record<string, Feed> = {
  domi: {
    name: 'Domi Staff',
    parts: [
      'SHIFTS',
      'TIME_OFF',
      'PAY_DAYS',
      PracticeEventKind.EVENT,
      PracticeEventKind.CLOSURE,
      PracticeEventKind.HOLIDAY,
      PracticeEventKind.DIAGNOSTIC,
      PracticeEventKind.REP_LUNCH,
    ],
  },
  shifts: { name: 'My shifts & time off', parts: ['SHIFTS', 'TIME_OFF'] },
  diagnostics: { name: 'Diagnostics', parts: [PracticeEventKind.DIAGNOSTIC] },
  'rep-lunches': { name: 'Rep lunches', parts: [PracticeEventKind.REP_LUNCH] },
  holidays: {
    name: 'Holidays & closures',
    parts: [PracticeEventKind.HOLIDAY, PracticeEventKind.CLOSURE],
  },
  'pay-days': { name: 'Pay days', parts: ['PAY_DAYS'] },
  events: { name: 'Meetings & events', parts: [PracticeEventKind.EVENT] },
};
