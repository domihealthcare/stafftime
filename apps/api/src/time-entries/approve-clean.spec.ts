import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { Role, TimeEntryStatus } from '@prisma/client';
import { CLEAN_ENTRY_WHERE } from './clean-entry';
import { TimeEntriesService } from './time-entries.service';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };

function build(count: number) {
  const prisma = {
    timeEntry: { updateMany: jest.fn().mockResolvedValue({ count }) },
  };
  const service = new TimeEntriesService(
    prisma as never,
    {} as never,
    new ConfigService({ PUNCH_GRACE_MINUTES: 5 }),
  );
  return { service, prisma };
}

describe('approving the hours with nothing flagged', () => {
  it('approves only those of the given entries that are clean, in one statement', async () => {
    const { service, prisma } = build(2);
    const result = await service.approveClean(['a', 'b', 'c'], manager);

    expect(prisma.timeEntry.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = prisma.timeEntry.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: { in: ['a', 'b', 'c'] }, ...CLEAN_ENTRY_WHERE });
    expect(data).toMatchObject({ status: TimeEntryStatus.APPROVED, approvedById: 'mgr-1' });
    expect(data.approvedAt).toBeInstanceOf(Date);
    // The one left over was flagged, or changed since the page was loaded.
    expect(result).toEqual({ approved: 2, left: 1 });
  });

  it('leaves out open, waiting-on-review and already approved entries', () => {
    expect(CLEAN_ENTRY_WHERE.status).toBe(TimeEntryStatus.COMPLETED);
    expect(CLEAN_ENTRY_WHERE.clockOutAt).toEqual({ not: null });
  });

  it('leaves out hours clocked out by the app at midnight, or entered by hand', () => {
    expect(CLEAN_ENTRY_WHERE.autoClockedOutAt).toBeNull();
    expect(CLEAN_ENTRY_WHERE.enteredByHandAt).toBeNull();
  });

  // The easy way to break this is a new flag on the timesheet that nobody
  // adds here, and then hours carrying it are approved in bulk unseen.
  it('requires every flag on a time entry to be off', () => {
    const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const model = schema.match(/model TimeEntry \{([\s\S]*?)\n\}/)?.[1] ?? '';
    const flags = [...model.matchAll(/^\s+(is[A-Z]\w*)\s+Boolean/gm)].map((m) => m[1]);

    expect(flags.length).toBeGreaterThanOrEqual(5);
    for (const flag of flags) {
      expect({ flag, value: (CLEAN_ENTRY_WHERE as Record<string, unknown>)[flag] }).toEqual({
        flag,
        value: false,
      });
    }
  });
});
