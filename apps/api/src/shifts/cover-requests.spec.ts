import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role, ShiftStatus } from '@prisma/client';
import { askWords, coverState, coverWhen, coverWhere, nobodyWords } from './cover-requests';
import { CoverRequestsService } from './cover-requests.service';

const NOW = new Date('2026-10-12T14:00:00Z');
// Tue Oct 13, 7am–2pm New Jersey.
const SHIFT = {
  id: 'shift-1',
  employeeId: null as string | null,
  startsAt: new Date('2026-10-13T11:00:00Z'),
  endsAt: new Date('2026-10-13T18:00:00Z'),
  status: ShiftStatus.PUBLISHED as ShiftStatus,
  isRemote: false,
  location: { name: 'West New York' },
  jobRole: { name: 'Front Desk' },
};
const mgr = { id: 'mgr-1', email: 'manager@domihealthcare.com', role: Role.MANAGER };
const ana = { id: 'emp-ana', email: 'ana@domihealthcare.com', role: Role.EMPLOYEE };
const bea = { id: 'emp-bea', email: 'bea@domihealthcare.com', role: Role.EMPLOYEE };

describe('cover words', () => {
  it('says when and where on the practice’s clock', () => {
    expect(coverWhen(SHIFT)).toBe('Tue, Oct 13, 7:00 AM–2:00 PM');
    expect(coverWhere(SHIFT)).toBe('at West New York (Front Desk)');
    expect(coverWhere({ ...SHIFT, isRemote: true, jobRole: null })).toBe('from home');
    expect(askWords(SHIFT).title).toBe('Can you cover Tue, Oct 13, 7:00 AM–2:00 PM?');
    expect(nobodyWords(SHIFT, 3).body).toContain('All 3 said no');
  });
});

describe('coverState', () => {
  const open = { closedAt: null, takenById: null };
  it('is open until started, covered, stopped or theirs', () => {
    expect(coverState(open, SHIFT, 'emp-ana', NOW)).toBe('open');
    expect(coverState(open, { ...SHIFT, startsAt: NOW }, 'emp-ana', NOW)).toBe('started');
    expect(coverState({ closedAt: NOW, takenById: null }, SHIFT, 'emp-ana', NOW)).toBe('stopped');
    expect(coverState({ closedAt: NOW, takenById: 'emp-bea' }, SHIFT, 'emp-ana', NOW)).toBe(
      'covered',
    );
    expect(coverState({ closedAt: NOW, takenById: 'emp-ana' }, SHIFT, 'emp-ana', NOW)).toBe(
      'yours',
    );
    // A manager put somebody in it another way.
    expect(coverState(open, { ...SHIFT, employeeId: 'emp-cat' }, 'emp-ana', NOW)).toBe('covered');
  });
});

function build(
  options: {
    shift?: typeof SHIFT;
    asks?: { employeeId: string; answer: boolean | null }[];
    /// Asked because of a provider's day off.
    linked?: boolean;
    /// What overlaps for whoever answers (linked requests read it with findMany).
    inTheWay?: { id: string; startsAt: Date; endsAt: Date; isRemote: boolean }[];
  } = {},
) {
  const shift = options.shift ?? SHIFT;
  const asks = options.asks ?? [
    { employeeId: 'emp-ana', answer: null },
    { employeeId: 'emp-bea', answer: null },
  ];
  const request = {
    id: 'req-1',
    askedById: 'mgr-1',
    closedAt: null,
    takenById: null,
    ptoRequestId: options.linked ? 'pto-1' : null,
    shift,
  };
  const tx = {
    shift: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    coverAsk: { update: jest.fn() },
    coverRequest: { update: jest.fn() },
  };
  const prisma = {
    shift: {
      findUnique: jest.fn().mockResolvedValue(shift),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(options.inTheWay ?? []),
    },
    coverRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'req-1', asks: [] }),
      findUnique: jest.fn(async ({ select }) => ({
        ...request,
        asks: select.asks.where
          ? asks.filter((ask) => ask.employeeId === select.asks.where.employeeId)
          : asks,
      })),
      update: jest.fn(),
    },
    coverAsk: {
      createMany: jest.fn(),
      findUnique: jest.fn(async ({ where }) =>
        asks.some((ask) => ask.employeeId === where.requestId_employeeId.employeeId)
          ? { request }
          : null,
      ),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ employeeId: 'emp-bea' }]),
    },
    employee: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'emp-ana',
        firstName: 'Ana',
        preferredName: null,
        lastName: 'Lopez',
      }),
    },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const notifications = { cover: jest.fn() };
  const coverOptions = {
    forShift: jest.fn().mockResolvedValue({
      options: [
        { employeeId: 'emp-ana', fit: 'good' },
        { employeeId: 'emp-bea', fit: 'catch' },
        { employeeId: 'emp-cat', fit: 'cannot' },
      ],
    }),
  };
  const service = new CoverRequestsService(
    prisma as never,
    notifications as never,
    coverOptions as never,
  );
  // The status read after asking is not what these tests are about.
  jest.spyOn(service, 'status').mockResolvedValue({ request: null });
  return { service, prisma, tx, notifications };
}

describe('asking', () => {
  it('asks only people who are free then, once each, by bell and email', async () => {
    const { service, prisma, notifications } = build();
    await service.ask('shift-1', ['emp-ana', 'emp-bea', 'emp-cat', 'emp-ana'], mgr, NOW);
    expect(prisma.coverAsk.createMany).toHaveBeenCalledWith({
      data: [
        { requestId: 'req-1', employeeId: 'emp-ana' },
        { requestId: 'req-1', employeeId: 'emp-bea' },
      ],
      skipDuplicates: true,
    });
    expect(notifications.cover).toHaveBeenCalledWith(['emp-ana', 'emp-bea'], {
      title: 'Can you cover Tue, Oct 13, 7:00 AM–2:00 PM?',
      body: expect.stringContaining('at West New York (Front Desk)'),
      link: '/cover/req-1',
    });
  });

  it('does not ask again somebody already asked in this round', async () => {
    const { service, prisma, notifications } = build();
    prisma.coverRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      asks: [{ employeeId: 'emp-ana' }],
    });
    await service.ask('shift-1', ['emp-ana', 'emp-bea'], mgr, NOW);
    expect(notifications.cover).toHaveBeenCalledWith(['emp-bea'], expect.anything());
    expect(prisma.coverRequest.create).not.toHaveBeenCalled();
  });

  it('refuses a shift somebody is on, or one that has started', async () => {
    await expect(
      build({ shift: { ...SHIFT, employeeId: 'emp-cat' } }).service.ask(
        'shift-1',
        ['emp-ana'],
        mgr,
        NOW,
      ),
    ).rejects.toThrow('already has somebody on it');
    await expect(
      build({ shift: { ...SHIFT, startsAt: NOW } }).service.ask('shift-1', ['emp-ana'], mgr, NOW),
    ).rejects.toThrow('already started');
    await expect(build().service.ask('shift-1', ['emp-cat'], mgr, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('answering', () => {
  it('a yes takes the shift - published - and tells the manager and those still to answer', async () => {
    const { service, tx, notifications } = build();
    jest.spyOn(service, 'view').mockResolvedValue({} as never);
    await service.answer('req-1', true, ana, NOW);
    expect(tx.shift.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'shift-1',
        employeeId: null,
        status: { not: ShiftStatus.CANCELLED },
        startsAt: { gt: NOW },
      },
      data: { employeeId: 'emp-ana', status: ShiftStatus.PUBLISHED },
    });
    expect(tx.coverRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { closedAt: NOW, takenById: 'emp-ana' },
    });
    expect(notifications.cover).toHaveBeenCalledWith(['mgr-1'], {
      title: 'Ana Lopez will cover Tue, Oct 13, 7:00 AM–2:00 PM',
      body: expect.any(String),
      link: '/schedule',
    });
    expect(notifications.cover).toHaveBeenCalledWith(['emp-bea'], {
      title: 'Tue, Oct 13, 7:00 AM–2:00 PM is covered',
      body: expect.any(String),
      link: '/cover/req-1',
    });
  });

  it('a second yes at the same moment is told it has gone', async () => {
    const { service, tx, notifications } = build();
    tx.shift.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.answer('req-1', true, ana, NOW)).rejects.toThrow('already taken');
    expect(notifications.cover).not.toHaveBeenCalled();
  });

  it('a yes from somebody already working then is refused', async () => {
    const { service, prisma } = build();
    prisma.shift.findFirst.mockResolvedValue({ id: 'other' });
    await expect(service.answer('req-1', true, ana, NOW)).rejects.toThrow('already have a shift');
  });

  it('when the last person says no, the manager is told nobody can', async () => {
    const { service, prisma, notifications } = build();
    jest.spyOn(service, 'view').mockResolvedValue({} as never);
    prisma.coverAsk.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    await service.answer('req-1', false, bea, NOW);
    expect(prisma.coverAsk.update).toHaveBeenCalledWith({
      where: { requestId_employeeId: { requestId: 'req-1', employeeId: 'emp-bea' } },
      data: { answer: false, answeredAt: NOW },
    });
    expect(notifications.cover).toHaveBeenCalledWith(['mgr-1'], {
      title: 'Nobody you asked can cover Tue, Oct 13, 7:00 AM–2:00 PM',
      body: expect.stringContaining('All 2 said no'),
      link: '/schedule',
    });
  });

  it('somebody who was not asked cannot answer, or even see it', async () => {
    const { service } = build();
    const cat = { id: 'emp-cat', email: 'c@x', role: Role.EMPLOYEE };
    await expect(service.answer('req-1', true, cat, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.view('req-1', cat, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows the person asked the shift and where it stands', async () => {
    const { service } = build();
    await expect(service.view('req-1', ana, NOW)).resolves.toMatchObject({
      when: 'Tue, Oct 13, 7:00 AM–2:00 PM',
      where: 'at West New York (Front Desk)',
      state: 'open',
      myAnswer: null,
    });
  });
});

describe("a provider's day off (linked to the time off)", () => {
  const REMOTE = {
    id: 'tele-1',
    startsAt: new Date('2026-10-13T13:00:00Z'),
    endsAt: new Date('2026-10-13T21:00:00Z'),
    isRemote: true,
  };

  it('asking uses the telemedicine swap rules, and the request remembers the time off', async () => {
    const { service, prisma, notifications } = build();
    const coverOptions = serviceDoubles(service).coverOptions;
    await service.ask('shift-1', ['emp-ana'], mgr, NOW, 'pto-1');
    expect(coverOptions.forShift).toHaveBeenCalledWith('shift-1', { swapRemote: true });
    expect(prisma.coverRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { shiftId: 'shift-1', askedById: 'mgr-1', ptoRequestId: 'pto-1' },
      }),
    );
    expect(notifications.cover).toHaveBeenCalled();
  });

  it('an ordinary ask keeps the old rules', async () => {
    const { service } = build();
    const coverOptions = serviceDoubles(service).coverOptions;
    await service.ask('shift-1', ['emp-ana'], mgr, NOW);
    expect(coverOptions.forShift).toHaveBeenCalledWith('shift-1', { swapRemote: false });
  });

  it('a later ask on the same shift keeps the swap rules', async () => {
    const { service, prisma } = build();
    const coverOptions = serviceDoubles(service).coverOptions;
    prisma.coverRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ptoRequestId: 'pto-1' });
    await service.ask('shift-1', ['emp-ana'], mgr, NOW);
    expect(coverOptions.forShift).toHaveBeenCalledWith('shift-1', { swapRemote: true });
  });

  it('a yes from someone on telemedicine then takes the shift and lets the telemedicine go', async () => {
    const { service, tx, notifications } = build({ linked: true, inTheWay: [REMOTE] });
    jest.spyOn(service, 'view').mockResolvedValue({} as never);
    await service.answer('req-1', true, ana, NOW);
    expect(tx.shift.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tele-1'] }, employeeId: 'emp-ana' },
      data: { employeeId: null, seriesId: null },
    });
    expect(tx.coverRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { closedAt: NOW, takenById: 'emp-ana', releasedShiftIds: ['tele-1'] },
    });
    expect(notifications.cover).toHaveBeenCalledWith(['mgr-1'], {
      title: 'Ana Lopez will cover Tue, Oct 13, 7:00 AM–2:00 PM',
      body: expect.stringContaining('their telemedicine 9:00 AM–5:00 PM is open'),
      link: '/schedule',
    });
  });

  it('is still refused for a shift at an office, or telemedicine already under way', async () => {
    const office = build({ linked: true, inTheWay: [{ ...REMOTE, isRemote: false }] });
    await expect(office.service.answer('req-1', true, ana, NOW)).rejects.toThrow(
      'already have a shift',
    );
    const started = build({
      linked: true,
      inTheWay: [{ ...REMOTE, startsAt: new Date('2026-10-12T13:00:00Z') }],
    });
    await expect(started.service.answer('req-1', true, ana, NOW)).rejects.toThrow(
      'already have a shift',
    );
  });

  it('an ordinary request with a remote clash is refused as before', async () => {
    const { service, prisma } = build({ inTheWay: [REMOTE] });
    prisma.shift.findFirst.mockResolvedValue({ id: 'tele-1' });
    await expect(service.answer('req-1', true, ana, NOW)).rejects.toThrow('already have a shift');
  });

  it('the person asked is told what saying yes will leave open', async () => {
    const { service } = build({ linked: true, inTheWay: [REMOTE] });
    await expect(service.view('req-1', ana, NOW)).resolves.toMatchObject({
      swap: true,
      willRelease: ['Your telemedicine Tue, Oct 13, 9:00 AM–5:00 PM will be left open.'],
    });
  });
});

function serviceDoubles(service: CoverRequestsService) {
  return service as unknown as { coverOptions: { forShift: jest.Mock } };
}
