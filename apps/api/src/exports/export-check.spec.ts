import { TimeEntryStatus } from '@prisma/client';
import { CheckEntry, ExportCheckInput, exportWarnings } from './export-check';

function entry(overrides: Partial<CheckEntry> = {}): CheckEntry {
  return {
    employeeName: 'Frankie Front-Desk',
    status: TimeEntryStatus.APPROVED,
    date: '2026-10-05',
    time: '09:00',
    hours: 8,
    clockedOut: true,
    autoClockedOut: false,
    missingPunch: false,
    enteredByHand: false,
    handEntryLookedInto: false,
    correctedSinceExport: null,
    ...overrides,
  };
}

function input(overrides: Partial<ExportCheckInput> = {}): ExportCheckInput {
  return {
    entries: [entry()],
    statuses: [TimeEntryStatus.COMPLETED, TimeEntryStatus.APPROVED],
    includeOpen: false,
    overtime: [],
    missingFileNumbers: [],
    ...overrides,
  };
}

const section = (check: ReturnType<typeof exportWarnings>, key: string) =>
  check.sections.find((candidate) => candidate.key === key);

describe('before you export', () => {
  it('says nothing about a period that is all approved', () => {
    expect(exportWarnings(input())).toEqual({ sections: [] });
  });

  it('groups hours not yet approved by person, and says whether they go out', () => {
    const entries = [
      entry({ status: TimeEntryStatus.COMPLETED }),
      entry({ status: TimeEntryStatus.COMPLETED, date: '2026-10-06', hours: 7.5 }),
      entry({
        status: TimeEntryStatus.COMPLETED,
        employeeName: 'Max Assistant',
        date: '2026-10-07',
      }),
    ];
    const out = section(exportWarnings(input({ entries })), 'unapproved')!;
    expect(out.title).toBe('Not approved yet — going out anyway');
    expect(out.lines).toEqual([
      'Frankie Front-Desk — 2 entries, 15.50 hours, from Mon, Oct 5',
      'Max Assistant — 1 entry, 8.00 hours, from Wed, Oct 7',
    ]);
    const approvedOnly = exportWarnings(input({ entries, statuses: [TimeEntryStatus.APPROVED] }));
    expect(section(approvedOnly, 'unapproved')!.title).toBe(
      'Not approved yet — left out of this file',
    );
  });

  it('names a midnight clock-out waiting on the real time, left out of the file', () => {
    const check = exportWarnings(
      input({
        entries: [
          entry({
            status: TimeEntryStatus.NEEDS_REVIEW,
            autoClockedOut: true,
            missingPunch: true,
            hours: 15,
          }),
        ],
      }),
    );
    expect(section(check, 'review')).toEqual({
      key: 'review',
      title: 'Waiting on a correction — left out of this file',
      lines: [
        'Frankie Front-Desk — clocked in Mon, Oct 5 at 9:00 AM: clocked out by the app at midnight, so the real time is needed',
      ],
    });
  });

  it('names somebody still clocked in', () => {
    const check = exportWarnings(
      input({ entries: [entry({ status: TimeEntryStatus.OPEN, clockedOut: false, hours: 0 })] }),
    );
    expect(section(check, 'open')!.lines).toEqual([
      'Frankie Front-Desk — clocked in Mon, Oct 5 at 9:00 AM, not out yet',
    ]);
  });

  it('lists hand entries nobody has looked into, and corrections since payroll, in the file only', () => {
    const check = exportWarnings(
      input({
        entries: [
          entry({ enteredByHand: true }),
          entry({ enteredByHand: true, handEntryLookedInto: true, date: '2026-10-06' }),
          entry({ correctedSinceExport: '2026-10-02', date: '2026-10-07' }),
          // Not in a file of approved hours: no line for it.
          entry({ enteredByHand: true, status: TimeEntryStatus.NEEDS_REVIEW, date: '2026-10-08' }),
        ],
      }),
    );
    expect(section(check, 'handEntries')!.lines).toEqual([
      'Frankie Front-Desk — Mon, Oct 5, 8.00 hours',
    ]);
    expect(section(check, 'corrected')!.lines).toEqual([
      'Frankie Front-Desk — Wed, Oct 7, first sent Fri, Oct 2; this file carries the corrected hours',
    ]);
  });

  it('puts missing ADP File #s first and overtime last', () => {
    const check = exportWarnings(
      input({
        entries: [entry({ status: TimeEntryStatus.COMPLETED })],
        missingFileNumbers: ['Max Assistant'],
        overtime: [
          { employeeName: 'Frankie Front-Desk', overtimeHours: 2.25 },
          { employeeName: 'Ada Admin', overtimeHours: 0 },
        ],
      }),
    );
    expect(check.sections.map((s) => s.key)).toEqual(['adp', 'unapproved', 'overtime']);
    expect(section(check, 'adp')!.lines).toEqual([
      'Max Assistant — an admin adds it under Edit on the Staff screen',
    ]);
    expect(section(check, 'overtime')!.lines).toEqual([
      'Frankie Front-Desk — 2.25 hours of overtime',
    ]);
  });
});
