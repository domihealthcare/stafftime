import { TimeEntryStatus } from '@prisma/client';
import { twelveHour } from '../availability/availability.rules';
import { shortDate } from '../pto/time-off-clashes';

/**
 * "Before you export" (October 2026, Dominguez — making the app smarter):
 * what is worth a look about a pay period before its hours go to payroll —
 * the moment a mistake costs the most. Warns, never refuses: the export works
 * as before (only ADP itself refuses a person with no File #, and says so).
 *
 * Pure: `ExportCheckService` reads the period's entries, the same ones the
 * export would (period, office, people), and this words them.
 */

export type ExportCheckKey =
  'adp' | 'review' | 'open' | 'unapproved' | 'handEntries' | 'corrected' | 'overtime';

export interface ExportCheckSection {
  key: ExportCheckKey;
  title: string;
  lines: string[];
}

export interface ExportCheck {
  sections: ExportCheckSection[];
}

export interface CheckEntry {
  employeeName: string;
  status: TimeEntryStatus;
  /// Day and time of the clock-in, on its office's clock.
  date: string;
  time: string;
  hours: number;
  clockedOut: boolean;
  autoClockedOut: boolean;
  missingPunch: boolean;
  enteredByHand: boolean;
  handEntryLookedInto: boolean;
  /// Corrected after it last went to payroll, and when that was (a date).
  correctedSinceExport: string | null;
}

export interface ExportCheckInput {
  /// Every entry in the period, office and people asked for, whatever its
  /// status — so the ones the file leaves out can be named.
  entries: CheckEntry[];
  /// The statuses the file takes, and whether it takes open entries.
  statuses: TimeEntryStatus[];
  includeOpen: boolean;
  /// Overtime per person in the file, by the export's own weekly rule.
  overtime: { employeeName: string; overtimeHours: number }[];
  /// Only for the ADP import: people going in with no File #.
  missingFileNumbers: string[];
}

const ORDER: ExportCheckKey[] = [
  'adp',
  'review',
  'open',
  'unapproved',
  'handEntries',
  'corrected',
  'overtime',
];

export function exportWarnings(input: ExportCheckInput): ExportCheck {
  const entries = [...input.entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  const inFile = (entry: CheckEntry) =>
    input.statuses.includes(entry.status) && (entry.clockedOut || input.includeOpen);
  const when = (entry: CheckEntry) => `${shortDate(entry.date)} at ${twelveHour(entry.time)}`;

  const unapproved = entries.filter(
    (entry) => entry.status === TimeEntryStatus.COMPLETED && entry.clockedOut,
  );
  const unapprovedGoesOut = input.statuses.includes(TimeEntryStatus.COMPLETED);

  const sections: Record<ExportCheckKey, { title: string; lines: string[] }> = {
    adp: {
      title: 'No ADP File # — the ADP file can’t be made without one',
      lines: input.missingFileNumbers.map(
        (name) => `${name} — an admin adds it under Edit on the Staff screen`,
      ),
    },
    review: {
      title: input.statuses.includes(TimeEntryStatus.NEEDS_REVIEW)
        ? 'Waiting on a correction — going out as they are'
        : 'Waiting on a correction — left out of this file',
      lines: entries
        .filter((entry) => entry.status === TimeEntryStatus.NEEDS_REVIEW)
        .map(
          (entry) =>
            `${entry.employeeName} — clocked in ${when(entry)}: ${
              entry.autoClockedOut && entry.missingPunch
                ? 'clocked out by the app at midnight, so the real time is needed'
                : entry.missingPunch
                  ? 'a punch is missing'
                  : 'needs review'
            }`,
        ),
    },
    open: {
      title: input.includeOpen
        ? 'Still clocked in — counted as no hours'
        : 'Still clocked in — left out of this file',
      lines: entries
        .filter((entry) => !entry.clockedOut && entry.status !== TimeEntryStatus.NEEDS_REVIEW)
        .map((entry) => `${entry.employeeName} — clocked in ${when(entry)}, not out yet`),
    },
    unapproved: {
      title: unapprovedGoesOut
        ? 'Not approved yet — going out anyway'
        : 'Not approved yet — left out of this file',
      lines: perPerson(unapproved).map(
        ({ name, list }) =>
          `${name} — ${list.length} ${list.length === 1 ? 'entry' : 'entries'}, ${hoursText(
            list.reduce((sum, entry) => sum + entry.hours, 0),
          )}, from ${shortDate(list[0].date)}`,
      ),
    },
    handEntries: {
      title: 'Entered by hand, and nobody has looked into why',
      lines: entries
        .filter((entry) => entry.enteredByHand && !entry.handEntryLookedInto && inFile(entry))
        .map(
          (entry) => `${entry.employeeName} — ${shortDate(entry.date)}, ${hoursText(entry.hours)}`,
        ),
    },
    corrected: {
      title: 'Corrected after they went to payroll',
      lines: entries
        .filter((entry) => entry.correctedSinceExport && inFile(entry))
        .map(
          (entry) =>
            `${entry.employeeName} — ${shortDate(entry.date)}, first sent ${shortDate(
              entry.correctedSinceExport!,
            )}; this file carries the corrected hours`,
        ),
    },
    overtime: {
      title: 'Overtime in this file',
      lines: input.overtime
        .filter((person) => person.overtimeHours > 0)
        .sort((a, b) => b.overtimeHours - a.overtimeHours)
        .map((person) => `${person.employeeName} — ${hoursText(person.overtimeHours)} of overtime`),
    },
  };

  return {
    sections: ORDER.filter((key) => sections[key].lines.length > 0).map((key) => ({
      key,
      ...sections[key],
    })),
  };
}

function perPerson(entries: CheckEntry[]): { name: string; list: CheckEntry[] }[] {
  const byName = new Map<string, CheckEntry[]>();
  for (const entry of entries) {
    byName.set(entry.employeeName, [...(byName.get(entry.employeeName) ?? []), entry]);
  }
  return [...byName].map(([name, list]) => ({ name, list }));
}

function hoursText(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded.toFixed(2)} ${rounded === 1 ? 'hour' : 'hours'}`;
}
