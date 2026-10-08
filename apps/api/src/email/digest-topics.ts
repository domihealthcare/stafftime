import { DigestTopic } from '@prisma/client';
import type { DigestContents } from './attention.service';

/**
 * Who gets which part of the nightly round-up (October 2026, Dominguez:
 * "certain managers should be notified of certain things but not everyone
 * needs to see all notifications each time").
 *
 * Sixteen sections are too many to choose between one by one, so they are
 * grouped into the parts of the practice somebody looks after: the rota, time
 * off, hours, licenses and so on. A manager leaves out the parts that are
 * somebody else's (`Employee.mutedDigestTopics`).
 *
 * **Nothing falls through the gap.** A part nobody is down for goes to
 * everyone who gets the round-up, as it did before there was a choice — so
 * the last manager to untick licenses cannot quietly stop anybody hearing
 * that one has lapsed.
 *
 * Only who is *emailed* changes. The banners on the screens are unchanged and
 * show every manager everything.
 */
export const DIGEST_TOPICS: Record<DigestTopic, (keyof DigestContents)[]> = {
  SCHEDULE: ['unpublishedRota', 'shiftsForLeavers', 'openShifts', 'shiftsInClosures'],
  TIME_OFF: ['undecidedTimeOff', 'timeOffClashes'],
  HOURS: ['missingPunches', 'unapprovedHours', 'handEntries', 'punchPatterns'],
  LICENSES: ['expiredCredentials', 'expiringCredentials', 'missingCredentials'],
  CHECKLISTS: ['overdueTasks'],
  CLOSING: ['closingGaps', 'suppliesNeeded'],
  TIME_CLOCK: ['silentKiosks'],
  SUGGESTIONS: ['newSuggestions'],
};

export const ALL_DIGEST_TOPICS = Object.keys(DIGEST_TOPICS) as DigestTopic[];

/// Somebody who may be sent a part of the round-up.
export interface TopicReader {
  mutedDigestTopics: DigestTopic[];
}

/// The people down for `topic` — or, when nobody is, all of them.
export function readersOf<T extends TopicReader>(topic: DigestTopic, people: T[]): T[] {
  const chosen = people.filter((person) => !person.mutedDigestTopics.includes(topic));
  return chosen.length > 0 ? chosen : people;
}

/// The topics with nobody down for them, among `people`.
export function uncoveredTopics(people: TopicReader[]): DigestTopic[] {
  return ALL_DIGEST_TOPICS.filter((topic) =>
    people.every((person) => person.mutedDigestTopics.includes(topic)),
  );
}

/// The round-up cut down to `topics`: the other sections emptied.
export function contentsFor(contents: DigestContents, topics: Set<DigestTopic>): DigestContents {
  const cut = { ...contents };
  for (const topic of ALL_DIGEST_TOPICS) {
    if (topics.has(topic)) continue;
    for (const key of DIGEST_TOPICS[topic]) cut[key] = [];
  }
  return cut;
}
