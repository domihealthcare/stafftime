import type { DigestTopic } from './types';

/// The parts of the nightly round-up, as Email settings offers them — the
/// server's `email/digest-topics.ts` decides which sections each one is.
/// What each covers is spelled out: "leave out Hours" is a much easier choice
/// to regret when nobody said what it would stop telling you.
export const DIGEST_TOPICS: {
  topic: DigestTopic;
  label: string;
  /// For the column heading on "Who gets what".
  short: string;
  covers: string[];
  /// Anything else the choice decides, beyond the round-up.
  note?: string;
}[] = [
  {
    topic: 'SCHEDULE',
    label: 'The rota',
    short: 'Rota',
    covers: [
      'Next week’s rota, when it is close and still unpublished',
      'Shifts still scheduled for people who have left',
      'Open shifts in the next two weeks that nobody is on yet',
      'Shifts on a day an office is closed',
    ],
  },
  {
    topic: 'HOURS',
    label: 'Hours and timesheets',
    short: 'Hours',
    covers: [
      'Clock-outs to correct — still clocked in at midnight, so the app clocked them out',
      'Hours nobody has approved yet',
      'Hours entered by hand that nobody has looked into yet',
    ],
  },
  {
    topic: 'TIME_OFF',
    label: 'Time off',
    short: 'Time off',
    covers: ['Time off waiting on a decision'],
    note: 'Also who is told, by email and the bell, as each request comes in.',
  },
  {
    topic: 'LICENSES',
    label: 'Licenses',
    short: 'Licenses',
    covers: [
      'Licenses and certifications that have already lapsed',
      'Licenses and certifications lapsing in the next 60 days',
      'Required licenses that are not on file',
    ],
  },
  {
    topic: 'TIME_CLOCK',
    label: 'The time clock',
    short: 'Time clock',
    covers: ['Time clock tablets that have stopped being used'],
  },
  {
    topic: 'CLOSING',
    label: 'Closing checklists and supplies',
    short: 'Closing',
    covers: ['Closing checklists with something missed', 'Supplies to order'],
  },
  {
    topic: 'CHECKLISTS',
    label: 'Onboarding and offboarding',
    short: 'Onboarding',
    covers: ['Checklist tasks past their due date'],
  },
  {
    topic: 'SUGGESTIONS',
    label: 'The suggestion box',
    short: 'Suggestions',
    covers: ['Notes in the suggestion box nobody has dealt with — how many, never the words'],
  },
];

export const topicLabel = (topic: DigestTopic) =>
  DIGEST_TOPICS.find((entry) => entry.topic === topic)?.label ?? topic;

/// The muted list with `topic` switched on or off.
export function toggled(muted: DigestTopic[], topic: DigestTopic, on: boolean): DigestTopic[] {
  const without = muted.filter((entry) => entry !== topic);
  return on ? without : [...without, topic];
}
