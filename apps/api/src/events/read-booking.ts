import { AiService, stringFields } from '../ai/ai.service';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * "Fill this in from a message" (October 2026, Dominguez — an AI idea): a
 * manager pastes a rep's email or text, or a note about a diagnostics day,
 * and the calendar's form is filled in from it to check before saving.
 *
 * Only the pasted words go to the AI service, with today's date and the two
 * offices' names. Which office and which rep are matched here, against the
 * app's own lists — the reps list (and its notes and statuses) never leaves.
 * Nothing is saved: the form is.
 */

export const BOOKING_KINDS = ['REP_LUNCH', 'DIAGNOSTIC', 'EVENT', 'HOLIDAY', 'CLOSURE'] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

/// What the AI service reads out of the message. Empty strings for anything
/// it does not say.
export interface RawBooking {
  kind: BookingKind;
  title: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  office: string;
  repName: string;
  repCompany: string;
  medication: string;
  place: string;
  description: string;
}

/// What the form is given: the same, with the office and rep found.
export interface ReadBooking {
  kind: BookingKind;
  title: string;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  locationId: string | null;
  repId: string | null;
  /// A rep the message names who is not on the list — to add under Reps.
  newRep: { name: string; company: string; medication: string } | null;
  place: string;
  description: string;
}

const SCHEMA = stringFields(
  {
    title:
      'A short title for an event or meeting, or the tests for diagnostics ("US + ECHO"); empty for a rep lunch',
    date: 'The first day, YYYY-MM-DD; empty if the message does not say',
    endDate: 'The last day for something over several days, YYYY-MM-DD; otherwise empty',
    startTime: 'Start time, 24-hour HH:MM; empty if not said or all day',
    endTime: 'End time, 24-hour HH:MM; empty if not said',
    office: 'North Bergen, West New York, or empty if the message does not say',
    repName: 'For a rep lunch, the rep’s name; otherwise empty',
    repCompany: 'For a rep lunch, the company; otherwise empty',
    medication: 'For a rep lunch, what they represent (drug names); otherwise empty',
    place: 'For an event, where it is if not one of the offices; otherwise empty',
    description:
      'Anything else staff need to know, briefly (catering, what to prepare); empty if nothing',
  },
  {
    kind: {
      type: 'string',
      enum: [...BOOKING_KINDS],
      description:
        'REP_LUNCH: a drug or device rep bringing lunch. DIAGNOSTIC: ultrasound, echo or other tests done at an office. HOLIDAY: a holiday the offices stay open for. CLOSURE: an office closed. EVENT: a meeting or anything else.',
    },
    allDay: { type: 'boolean', description: 'True for something that lasts the whole day' },
  },
);

const RULES = `Domi Healthcare is a primary care practice with two offices in New Jersey: North Bergen and West New York. A manager has pasted a message — usually a drug rep booking a lunch, or a note about a diagnostics day — to put it on the practice calendar.

Read what the message says into the fields.
- Use only what it says. Leave a field empty rather than guess; never invent a date, time, office or name.
- Work out dates from today's date given below: "next Tuesday", "the 14th", "Oct 20". A date without a year is the next one to come.
- If the message contains anything about a patient, ignore it.`;

/// Today in words, for "next Tuesday".
function todayLine(now: Date): string {
  const day = localDateIn(now, PRACTICE_ZONE);
  const words = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `Today is ${words} (${day}).`;
}

export async function readBooking(
  ai: AiService,
  prisma: PrismaService,
  managerId: string,
  text: string,
  now = new Date(),
): Promise<ReadBooking | null> {
  const raw = await ai.json<RawBooking>(managerId, {
    system: RULES,
    prompt: `${todayLine(now)}\n\nThe message:\n<message>\n${text.trim()}\n</message>`,
    schema: SCHEMA,
  });
  if (!raw) return null;
  const [locations, reps] = await Promise.all([
    prisma.location.findMany({ select: { id: true, name: true } }),
    prisma.rep.findMany({ select: { id: true, name: true, company: true } }),
  ]);
  return matchBooking(raw, locations, reps);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The raw reading, checked and tied to the app's lists: dates and times only
 * in the form's shapes, the office by name ("WNY" and "NB" too), and the rep
 * when exactly one on the list has that name (the company settles a tie).
 */
export function matchBooking(
  raw: RawBooking,
  locations: { id: string; name: string }[],
  reps: { id: string; name: string; company: string | null }[],
): ReadBooking {
  const kind = BOOKING_KINDS.includes(raw.kind) ? raw.kind : 'EVENT';

  const office = plain(raw.office ?? '');
  const short: Record<string, string> = { nb: 'north bergen', wny: 'west new york' };
  const wanted = short[office] ?? office;
  const location = wanted
    ? (locations.find((place) => plain(place.name) === wanted) ??
      locations.find((place) => plain(place.name).includes(wanted)))
    : undefined;

  let repId: string | null = null;
  let newRep: ReadBooking['newRep'] = null;
  if (kind === 'REP_LUNCH' && raw.repName?.trim()) {
    const name = plain(raw.repName);
    let named = reps.filter((rep) => plain(rep.name) === name);
    if (named.length === 0) {
      // "Sarah" for "Sarah Lopez", or the other way round.
      named = reps.filter(
        (rep) => plain(rep.name).startsWith(`${name} `) || name.startsWith(`${plain(rep.name)} `),
      );
    }
    if (named.length > 1 && raw.repCompany?.trim()) {
      const company = plain(raw.repCompany);
      named = named.filter((rep) => rep.company && plain(rep.company).includes(company));
    }
    if (named.length === 1) {
      repId = named[0].id;
    } else if (named.length === 0) {
      newRep = {
        name: raw.repName.trim(),
        company: raw.repCompany?.trim() ?? '',
        medication: raw.medication?.trim() ?? '',
      };
    }
  }

  const date = DATE.test(raw.date ?? '') ? raw.date : null;
  const endDate = DATE.test(raw.endDate ?? '') && date && raw.endDate >= date ? raw.endDate : null;
  const startTime = TIME.test(raw.startTime ?? '') ? raw.startTime : null;
  const endTime = TIME.test(raw.endTime ?? '') ? raw.endTime : null;
  return {
    kind,
    title: (raw.title ?? '').trim().slice(0, 160),
    date,
    endDate,
    startTime,
    endTime,
    // A holiday or closure without times is the day; anything with a time is not.
    allDay: startTime ? false : raw.allDay === true || kind === 'HOLIDAY',
    locationId: location?.id ?? null,
    repId,
    newRep,
    place: (raw.place ?? '').trim().slice(0, 200),
    description: (raw.description ?? '').trim().slice(0, 2000),
  };
}
