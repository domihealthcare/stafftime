import { ClosingService } from './closing.service';

const NB = 'loc-nb';
const WNY = 'loc-wny';

/// Thursday 24 September 2026, 5 pm in New Jersey.
const THURSDAY = new Date('2026-09-24T21:00:00Z');
/// Friday 25 September 2026, 5 pm in New Jersey.
const FRIDAY = new Date('2026-09-25T21:00:00Z');

const item = (id: string, kind: string, text: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind,
  text,
  target: null,
  weekdays: [],
  locationId: null,
  ...extra,
});

function roles() {
  return [
    {
      name: 'Front Desk',
      closingSections: [
        {
          id: 'sec-checkin',
          title: 'Check In Desk',
          isPosition: true,
          items: [item('i-scan', 'TASK', 'Scanned IDs')],
        },
        {
          id: 'sec-out',
          title: 'Outdesk',
          isPosition: true,
          items: [item('i-voicemail', 'TASK', 'Voicemails returned')],
        },
        {
          id: 'sec-all',
          title: 'Everyone',
          isPosition: false,
          items: [
            item('i-rule', 'REMINDER', 'Never leave a patient on hold'),
            item('i-tv', 'TASK', 'TVs off'),
            item('i-calls', 'COUNT', 'Calls answered', { target: 20 }),
            item('i-placed', 'COUNT', 'Calls placed'),
            item('i-trash', 'TASK', 'Trash out', { weekdays: [2, 4], locationId: NB }),
            item('i-gloves', 'SUPPLY', 'Gloves S/M/L'),
            item('i-tape', 'SUPPLY', 'Paper tape'),
          ],
        },
      ],
    },
  ];
}

function build(options: { openSupply?: boolean; roles?: unknown[] } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created: { record?: any } = {};
  const prisma = {
    location: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'America/New_York' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone: 'America/New_York' }),
    },
    jobRole: { findMany: jest.fn().mockResolvedValue(options.roles ?? roles()) },
    timeEntry: { findFirst: jest.fn() },
    closingRecord: {
      create: jest.fn(async ({ data }) => {
        created.record = data;
        return { id: 'rec-1' };
      }),
    },
    supplyRequest: {
      findFirst: jest.fn().mockResolvedValue(options.openSupply ? { id: 'sup-open' } : null),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  return { service: new ClosingService(prisma as never), prisma, created };
}

const entry = (locationId = NB) => ({
  id: 'te-1',
  employeeId: 'emp-1',
  locationId,
  clockInAt: new Date('2026-09-24T13:00:00Z'),
});

describe('ClosingService — what applies', () => {
  it('leaves out items for another day of the week', async () => {
    const { service } = build();
    const sections = await service.applicableFor('emp-1', NB, FRIDAY);
    const texts = sections.flatMap((s) => s.items.map((i) => i.text));
    expect(texts).not.toContain('Trash out');
  });

  it('includes a Tuesday/Thursday item at its office on a Thursday', async () => {
    const { service } = build();
    const sections = await service.applicableFor('emp-1', NB, THURSDAY);
    expect(sections.flatMap((s) => s.items.map((i) => i.text))).toContain('Trash out');
  });

  it('leaves out an item that belongs to the other office', async () => {
    const { service } = build();
    const sections = await service.applicableFor('emp-1', WNY, THURSDAY);
    expect(sections.flatMap((s) => s.items.map((i) => i.text))).not.toContain('Trash out');
  });

  it('is empty for somebody whose job roles have no checklist', async () => {
    const { service } = build({ roles: [{ name: 'Provider', closingSections: [] }] });
    expect(await service.applicableFor('emp-1', NB, THURSDAY)).toEqual([]);
  });
});

describe('ClosingService — recording a clock-out', () => {
  it('flags unticked tasks and a count under its target, and nothing for reminders', async () => {
    const { service, created } = build();
    await service.recordForClockOut(entry(WNY), {
      positions: ['sec-checkin'],
      done: ['i-scan'],
      counts: [
        { itemId: 'i-calls', value: 12 },
        { itemId: 'i-placed', value: 4 },
      ],
    });

    const record = created.record;
    expect(record.submitted).toBe(true);
    expect(record.positions).toEqual(['Check In Desk']);
    // TVs off unticked, and 12 calls answered is under 20.
    expect(record.gaps).toBe(2);
    const answers = record.answers.createMany.data;
    expect(answers.map((a: { text: string }) => a.text)).not.toContain(
      'Never leave a patient on hold',
    );
    // The desk they did not work is not on their record at all.
    expect(answers.map((a: { text: string }) => a.text)).not.toContain('Voicemails returned');
    expect(answers.find((a: { text: string }) => a.text === 'Calls placed').count).toBe(4);
  });

  it('a count with no target is never a gap, but a count left blank is', async () => {
    const { service, created } = build();
    await service.recordForClockOut(entry(WNY), {
      done: ['i-tv'],
      counts: [{ itemId: 'i-calls', value: 25 }],
    });
    // Calls placed left blank.
    expect(created.record.gaps).toBe(1);
  });

  it('records a skipped checklist as not filled in, with everything outstanding', async () => {
    const { service, created } = build();
    await service.recordForClockOut(entry(WNY), { skipped: true, done: ['i-tv'] });
    expect(created.record.submitted).toBe(false);
    expect(created.record.positions).toEqual([]);
    expect(created.record.gaps).toBe(3);
  });

  it('records a clock-out with no checklist sent at all, e.g. a manager closing the punch', async () => {
    const { service, created } = build();
    await service.recordForClockOut(entry(WNY), undefined);
    expect(created.record.submitted).toBe(false);
  });

  it('puts ticked supplies on the restock list', async () => {
    const { service, prisma } = build();
    await service.recordForClockOut(entry(NB), { needed: ['i-gloves'], done: [] });
    expect(prisma.supplyRequest.create).toHaveBeenCalledWith({
      data: { locationId: NB, itemId: 'i-gloves', text: 'Gloves S/M/L', lastAskedById: 'emp-1' },
    });
  });

  it('asking again for a supply already on the list adds to it, not a second line', async () => {
    const { service, prisma } = build({ openSupply: true });
    await service.recordForClockOut(entry(NB), { needed: ['i-gloves'] });
    expect(prisma.supplyRequest.create).not.toHaveBeenCalled();
    expect(prisma.supplyRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sup-open' },
        data: expect.objectContaining({ timesAsked: { increment: 1 } }),
      }),
    );
  });

  it('ignores ids that are not on this person’s checklist', async () => {
    const { service, created, prisma } = build();
    await service.recordForClockOut(entry(WNY), {
      done: ['not-an-item', 'i-tv'],
      needed: ['somebody-elses-supply'],
      counts: [
        { itemId: 'i-calls', value: 30 },
        { itemId: 'i-placed', value: 1 },
      ],
    });
    expect(created.record.gaps).toBe(0);
    expect(prisma.supplyRequest.create).not.toHaveBeenCalled();
  });

  it('never throws, so a clock-out cannot fail because of its checklist', async () => {
    const { service, prisma } = build();
    prisma.closingRecord.create.mockRejectedValue(new Error('database away'));
    await expect(service.recordForClockOut(entry(WNY), {})).resolves.toBeUndefined();
  });

  it('writes nothing for somebody with no checklist', async () => {
    const { service, prisma } = build({ roles: [] });
    await service.recordForClockOut(entry(WNY), {});
    expect(prisma.closingRecord.create).not.toHaveBeenCalled();
  });
});
