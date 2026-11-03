import { formatTimeCompact, localDate } from './format';
import { t } from './i18n';
import { CALENDAR_KINDS } from './calendar-kinds';
import type { EventKind, PracticeEvent, Student, StudentKind } from './types';

/**
 * The plain helpers for practice events: which days an event covers, its
 * time and audience in words, what a chip calls it. Kept apart from
 * components/PracticeEvents.tsx (the event editor and its pop-ups) so that
 * Home's lunch icon can use them without loading the whole editor on first
 * visit. PracticeEvents.tsx re-exports them, so existing imports still work.
 */

export const isClosure = (event: PracticeEvent) => event.kind === 'CLOSURE';
/// Holidays, diagnostics, rep lunches, the phlebotomist and student
/// rotations are for everyone to see; nobody chooses who.
export const forEveryone = (kind: EventKind) =>
  kind === 'HOLIDAY' ||
  kind === 'DIAGNOSTIC' ||
  kind === 'REP_LUNCH' ||
  kind === 'PHLEBOTOMY' ||
  kind === 'ROTATION';
/// Diagnostics, rep lunches, the phlebotomist and student rotations happen
/// at an office.
export const atAnOffice = (kind: EventKind) =>
  kind === 'DIAGNOSTIC' || kind === 'REP_LUNCH' || kind === 'PHLEBOTOMY' || kind === 'ROTATION';

/// Whether the Calendar shows an event with a place chosen: what is at that
/// office or shuts it, and everything practice-wide. Telemedicine is no
/// office, so nothing at an office or shutting one goes with it.
export function shownAt(event: PracticeEvent, place: string): boolean {
  if (!place) return true;
  if (atAnOffice(event.kind)) return event.atLocation?.id === place;
  if (event.kind === 'CLOSURE' && event.audience === 'LOCATION') {
    return event.location?.id === place;
  }
  return true;
}

/// What a chip calls it: a rep lunch by its rep, a student rotation by the
/// student and their provider, the rest by their title.
export function shortTitle(event: PracticeEvent): string {
  if (event.kind === 'ROTATION') {
    return event.provider
      ? t('{student} with {provider}', { student: event.title, provider: event.provider.name })
      : event.title;
  }
  return event.kind === 'REP_LUNCH'
    ? (event.rep?.name ?? event.title.replace(/^Rep lunch: /, ''))
    : event.title;
}

/// What each kind of student is called.
export const STUDENT_KINDS: { value: StudentKind; label: string }[] = [
  { value: 'MEDICAL_STUDENT', label: 'Medical student' },
  { value: 'RESIDENT', label: 'Resident' },
  { value: 'NP_STUDENT', label: 'NP student' },
  { value: 'PA_STUDENT', label: 'PA student' },
  { value: 'NURSING_STUDENT', label: 'Nursing student' },
  { value: 'OTHER', label: 'Student' },
];

/// "Medical student, Rutgers NJMS" - or just "Resident" with no school.
export function describeStudent(student: Pick<Student, 'kind' | 'school'>): string {
  const kind = t(STUDENT_KINDS.find((one) => one.value === student.kind)?.label ?? 'Student');
  return student.school ? `${kind}, ${student.school}` : kind;
}

/// A video call link fit to open: https only. The server refuses anything
/// else; this is the second lock on the door.
export function joinLink(event: PracticeEvent): string | null {
  return event.meetingUrl && /^https:\/\/\S+$/.test(event.meetingUrl) ? event.meetingUrl : null;
}

/// The days an event covers, as the viewer's "YYYY-MM-DD".
export function daysOf(event: PracticeEvent): { first: string; last: string } {
  if (event.allDay && event.startDate && event.endDate) {
    return { first: event.startDate, last: event.endDate };
  }
  // A meeting that ends at midnight belongs to the day it started.
  return {
    first: localDate(new Date(event.startsAt)),
    last: localDate(new Date(new Date(event.endsAt).getTime() - 1)),
  };
}

/// The events on one day: closures first, then holidays, diagnostics and
/// meetings; within each, all-day ones first, then by time.
export function eventsOnDay(events: PracticeEvent[], day: string): PracticeEvent[] {
  const rank = (event: PracticeEvent) => CALENDAR_KINDS.indexOf(event.kind);
  return events
    .filter((event) => {
      const { first, last } = daysOf(event);
      return first <= day && day <= last;
    })
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.allDay) - Number(a.allDay) ||
        a.startsAt.localeCompare(b.startsAt) ||
        a.title.localeCompare(b.title),
    );
}

/// Midnight on the viewer's clock - the end of a "closes at 1pm" day.
const atMidnight = (iso: string) => {
  const date = new Date(iso);
  return date.getHours() === 0 && date.getMinutes() === 0;
};

/// "All day", "12:30pm–1:30pm", or for a meeting running past midnight
/// "from 6pm" / "until 1am" on its first and last day. A closure says
/// "Closed all day", "Closed from 1pm", "Closed 12pm–2pm".
export function eventTimeLabel(event: PracticeEvent, day?: string): string {
  if (event.allDay) return isClosure(event) ? t('Closed all day') : t('All day');
  const time = bareTime(event, day);
  return isClosure(event) ? t('Closed {time}', { time }) : time;
}

/// The time without "Closed": "from 1pm", "12pm–2pm", "until 1am", "all day".
export function bareTime(event: PracticeEvent, day?: string): string {
  if (event.allDay) return t('all day');
  const { first, last } = daysOf(event);
  const start = formatTimeCompact(event.startsAt);
  const end = formatTimeCompact(event.endsAt);
  if (first === last || !day) {
    return atMidnight(event.endsAt) ? t('from {time}', { time: start }) : `${start}–${end}`;
  }
  if (day === first) return t('from {time}', { time: start });
  if (day === last) return t('until {time}', { time: end });
  return t('all day');
}

/// "Everyone", "Provider", "North Bergen" - or for a closure, which offices.
export function audienceLabel(event: PracticeEvent): string {
  if (atAnOffice(event.kind)) return event.atLocation?.name ?? t('An office since removed');
  if (event.audience === 'CHOSEN') {
    const names = event.invitees.map((invitee) => invitee.name);
    if (names.length === 0) return t('Nobody - everyone on the list has since gone');
    return names.length <= 3
      ? names.join(', ')
      : t('{names} and {n} more', { names: names.slice(0, 2).join(', '), n: names.length - 2 });
  }
  if (event.audience === 'JOB_ROLE') return event.jobRole?.name ?? t('A job role since removed');
  if (event.audience === 'LOCATION') return event.location?.name ?? t('An office since removed');
  return isClosure(event) ? t('Both offices') : t('Everyone');
}
