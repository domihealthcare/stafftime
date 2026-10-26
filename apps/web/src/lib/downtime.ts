import { formatPracticeDateTime, practiceClockOf, practiceDate } from './practice-time';
import type { Downtime, DowntimeCause, DowntimeContact, DowntimeSystem } from './types';

/**
 * Downtime on the web side (October 2026, Dominguez): the words, the choices
 * and the forms the Downtime page prints. The rules that decide who is told
 * and when are the server's (`downtime/downtime.ts`).
 */

export const SYSTEM_OPTIONS: { value: DowntimeSystem; label: string; hint: string }[] = [
  { value: 'ECW', label: 'eCW', hint: 'The EMR. The same for both offices.' },
  {
    value: 'PHONES',
    label: 'Phones (Weave)',
    hint: 'The phones, fax, the card machine and the Weave app.',
  },
  {
    value: 'INTERNET',
    label: 'Internet',
    hint: 'At the office: eCW and Weave usually go with it.',
  },
];

export const CAUSE_OPTIONS: { value: DowntimeCause; label: string }[] = [
  { value: 'ECW_OUTAGE', label: 'eCW outage' },
  { value: 'INTERNET_PROVIDER', label: 'Internet provider' },
  { value: 'POWER', label: 'Power' },
  { value: 'WEAVE', label: 'Weave' },
  { value: 'PLANNED_MAINTENANCE', label: 'Planned maintenance' },
  { value: 'OTHER', label: 'Other' },
];

/// The likeliest cause, to start the closing form on.
export function likelyCause(downtime: Pick<Downtime, 'systems' | 'planned'>): DowntimeCause {
  if (downtime.planned) return 'PLANNED_MAINTENANCE';
  if (downtime.systems.includes('INTERNET')) return 'INTERNET_PROVIDER';
  if (downtime.systems.includes('ECW')) return 'ECW_OUTAGE';
  if (downtime.systems.includes('PHONES')) return 'WEAVE';
  return 'OTHER';
}

/// "45 minutes", "2 hours 15 minutes", "1 day 3 hours".
export function minutesWords(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} ${whole === 1 ? 'minute' : 'minutes'}`;
  const days = Math.floor(whole / 1440);
  const hours = Math.floor((whole % 1440) / 60);
  const mins = whole % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (!days && mins) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

/// How the catch-up goes by how long it was down, as the server works it out.
export function catchUpRule(minutes: number): 'SAME_DAY' | 'NEXT_WORKING_DAY' | 'PLAN' {
  if (minutes < 4 * 60) return 'SAME_DAY';
  if (minutes <= 24 * 60) return 'NEXT_WORKING_DAY';
  return 'PLAN';
}

/// The support contacts for what is down (a contact with no systems is for all).
export function contactsFor(downtime: Pick<Downtime, 'systems'>, contacts: DowntimeContact[]) {
  return contacts.filter(
    (contact) =>
      contact.systems.length === 0 ||
      contact.systems.some((system) => downtime.systems.includes(system)),
  );
}

/// An email to support, written for them: the office, what is down, since when.
export function supportEmail(contact: DowntimeContact, downtime: Downtime): string | null {
  if (!contact.email) return null;
  const since = new Date(downtime.startsAt).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const subject = `Domi Healthcare: ${downtime.headline}`;
  const body = [
    'Hello,',
    '',
    `${downtime.headline}, since ${since}.`,
    downtime.note ?? '',
    '',
    'Please let us know when it will be back.',
    '',
    'Thank you,',
    'Domi Healthcare',
    'Tel 201-528-3664',
  ]
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n');
  return `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/// Fired when a downtime starts, changes or ends, so the red bar looks again.
export const DOWNTIME_CHANGED = 'domi:downtime-changed';
export const downtimeChanged = () => window.dispatchEvent(new Event(DOWNTIME_CHANGED));

/// The forms that print from the Downtime page, in the order the stack goes.
export type DowntimeFormKey =
  | 'sign-in'
  | 'running'
  | 'checkout'
  | 'call-back'
  | 'note'
  | 'pads'
  | 'braincheck'
  | 'awv'
  | 'awv-es'
  | 'role'
  | 'sign';

export const DOWNTIME_FORMS: {
  key: DowntimeFormKey;
  title: string;
  description: string;
  /// What one copy is.
  unit: string;
}[] = [
  {
    key: 'sign-in',
    title: 'Sign-in sheet',
    description:
      'One per office per day, landscape. The front desk writes each patient in as they arrive, with the times as the visit goes and the copay.',
    unit: 'sheet',
  },
  {
    key: 'running',
    title: 'Running patient sheet',
    description:
      'Two to a page. Goes with the patient from the front desk to the MA, the provider and back, with a time and initials at each step.',
    unit: 'page of two',
  },
  {
    key: 'checkout',
    title: 'Checkout list',
    description:
      'Every patient who needs a follow-up appointment: when, and what for. Booked once eCW is back.',
    unit: 'sheet',
  },
  {
    key: 'call-back',
    title: 'Call-back list',
    description: 'Appointment requests, refills and messages taken while eCW is down.',
    unit: 'sheet',
  },
  {
    key: 'note',
    title: 'Downtime progress note',
    description: 'The visit note on paper, two pages, signed by the provider.',
    unit: 'note (2 pages)',
  },
  {
    key: 'pads',
    title: 'Order pads',
    description:
      'A lab order and a referral and imaging slip on one page, with every provider and their NPI under the signature.',
    unit: 'page',
  },
  {
    key: 'braincheck',
    title: 'BrainCheck Care Plan',
    description:
      'The 99483 assessment and care plan on paper, every section and choice as on screen. Entered in Domi Staff once it is back, for the note and the handout.',
    unit: 'form',
  },
  {
    key: 'awv',
    title: 'Annual Wellness Visit',
    description:
      'Page 1, the questionnaire and SPMSQ (provider); page 2, preventive services (MA). Entered in Domi Staff once it is back.',
    unit: 'form (2 pages)',
  },
  {
    key: 'awv-es',
    title: 'Annual Wellness Visit, in Spanish',
    description:
      'The same, with page 1 in Spanish (the English under each question) for a Spanish-speaking patient.',
    unit: 'form (2 pages)',
  },
  {
    key: 'sign',
    title: 'Window sign',
    description: 'For the front desk window, in English and Spanish.',
    unit: 'sign',
  },
];

/// The "What to do" sheets, one per job.
export const ROLE_SHEETS = [
  'Front desk',
  'Medical assistant',
  'Provider',
  'Managers and admins',
] as const;

export function printLink(form: DowntimeFormKey, copies: number, group?: string): string {
  const params = new URLSearchParams({ form, copies: String(copies) });
  if (group) params.set('group', group);
  return `/downtime/print?${params.toString()}`;
}

/// "9:10 AM" on the practice's clock, or "Mon, Oct 26, 9:10 AM" when not today.
export function practiceTimeWords(iso: string): string {
  if (practiceDate(new Date(iso)) === practiceDate()) {
    const [hour, minute] = practiceClockOf(iso).split(':').map(Number);
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  }
  return formatPracticeDateTime(iso);
}

/// The practice's details on the order pads, as Dominguez gave them (26
/// October 2026; the old paper pads had 211 and older numbers). The same as
/// the care plan's letterhead.
export const PAD_LETTERHEAD = {
  offices: [
    { name: 'West New York', address: '219 60th Street, West New York, NJ 07093' },
    { name: 'North Bergen', address: '7919 John F. Kennedy Blvd., North Bergen, NJ 07047' },
  ],
  phone: '201-528-3664',
  fax: '201-528-3662',
};

/// "NB", "WNY": an office by its initials, as the practice writes them.
export const officeInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
