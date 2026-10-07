import { NotificationKind, Prisma } from '@prisma/client';
import { LunchNoticesService } from './lunch-notices.service';

// Tuesday 10 November 2099 in New Jersey (EST, UTC-5).
const EVENING = new Date('2099-11-10T23:30:00.000Z'); // 6:30 PM
const AFTERNOON = new Date('2099-11-10T21:00:00.000Z'); // 4:00 PM

const OFFICES = [
  { id: 'loc-nb', name: 'North Bergen' },
  { id: 'loc-wny', name: 'West New York' },
];

function build(
  options: {
    lunches?: Record<string, unknown[]>;
    /// Offices with somebody working tomorrow.
    open?: string[];
    /// Offices shut all day tomorrow.
    closed?: string[];
    /// Offices already told tonight (the claim fails).
    alreadyTold?: string[];
  } = {},
) {
  const open = options.open ?? ['loc-nb', 'loc-wny'];
  const prisma = {
    location: { findMany: jest.fn().mockResolvedValue(OFFICES) },
    shift: {
      count: jest.fn(async ({ where }) => (open.includes(where.locationId) ? 2 : 0)),
    },
    practiceEvent: {
      count: jest.fn(async ({ where }) =>
        (options.closed ?? []).includes(where.OR[1].locationId) ? 1 : 0,
      ),
      findMany: jest.fn(async ({ where }) => options.lunches?.[where.atLocationId] ?? []),
    },
    lunchNotice: {
      create: jest.fn(async ({ data }) => {
        if ((options.alreadyTold ?? []).includes(data.locationId)) {
          throw new Prisma.PrismaClientKnownRequestError('taken', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        return data;
      }),
    },
    employee: {
      findMany: jest.fn(async ({ where }) =>
        where.locations.some.locationId === 'loc-nb'
          ? [{ id: 'emp-frankie' }, { id: 'emp-max' }]
          : [{ id: 'emp-wny' }],
      ),
    },
  };
  const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
  return { service: new LunchNoticesService(prisma as never, inbox as never), prisma, inbox };
}

const janesLunch = {
  startsAt: new Date('2099-11-11T17:30:00.000Z'), // 12:30 PM
  title: 'Rep lunch: Jane Smith',
  rep: { name: 'Jane Smith', company: 'Novo Nordisk', food: 'CATERING' },
};

describe('LunchNoticesService', () => {
  it('waits for the evening', async () => {
    const { service, inbox } = build();
    expect(await service.send(AFTERNOON)).toBe(0);
    expect(inbox.notify).not.toHaveBeenCalled();
  });

  it('tells an office about tomorrow’s rep lunch: who, when and the food', async () => {
    const { service, inbox } = build({ lunches: { 'loc-nb': [janesLunch] } });
    await service.send(EVENING);
    const [people, notice] = inbox.notify.mock.calls[0];
    expect(people).toEqual(['emp-frankie', 'emp-max']);
    expect(notice).toMatchObject({
      kind: NotificationKind.EVENT,
      title: 'Rep lunch tomorrow at North Bergen',
      body: '12:30 PM — Jane Smith (Novo Nordisk), bringing catering',
    });
  });

  it('tells an office with no rep lunch to bring their own', async () => {
    const { service, inbox } = build({ lunches: { 'loc-nb': [janesLunch] } });
    await service.send(EVENING);
    const [people, notice] = inbox.notify.mock.calls[1];
    expect(people).toEqual(['emp-wny']);
    expect(notice).toMatchObject({
      title: 'No rep lunch tomorrow at West New York',
      body: 'Bring your own lunch.',
    });
  });

  it('looks at tomorrow on the practice clock', async () => {
    const { service, prisma } = build();
    await service.send(EVENING);
    expect(prisma.shift.count.mock.calls[0][0].where.startsAt).toEqual({
      gte: new Date('2099-11-11T05:00:00.000Z'),
      lt: new Date('2099-11-12T05:00:00.000Z'),
    });
    expect(prisma.lunchNotice.create.mock.calls[0][0].data.day).toEqual(
      new Date('2099-11-11T00:00:00.000Z'),
    );
  });

  it('says nothing to an office nobody is working at tomorrow, or that is closed', async () => {
    const { service, inbox } = build({ open: ['loc-nb'], closed: ['loc-nb'] });
    expect(await service.send(EVENING)).toBe(0);
    expect(inbox.notify).not.toHaveBeenCalled();
  });

  it('tells each office once, however often the timer runs', async () => {
    const { service, inbox } = build({ alreadyTold: ['loc-nb'] });
    expect(await service.send(EVENING)).toBe(1);
    expect(inbox.notify).toHaveBeenCalledTimes(1);
    expect(inbox.notify.mock.calls[0][1].title).toContain('West New York');
  });
});
