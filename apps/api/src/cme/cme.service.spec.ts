import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CmeFormat, CmeStatus, NotificationKind, Role } from '@prisma/client';
import { CmeService } from './cme.service';

const provider = { id: 'p1', email: 'jd@example.com', role: Role.EMPLOYEE };
const manager = { id: 'm1', email: 'kb@example.com', role: Role.MANAGER };
const person = {
  id: 'p1',
  firstName: 'Jonathan',
  lastName: 'Dominguez',
  preferredName: null,
  postNominals: 'MD',
  photoUpdatedAt: null,
};
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  employeeId: 'p1',
  title: 'AAFP FMX',
  organizer: null,
  format: CmeFormat.IN_PERSON,
  place: 'Orlando, FL',
  startsOn: new Date('2027-03-03T00:00:00Z'),
  endsOn: new Date('2027-03-05T00:00:00Z'),
  credits: null,
  registrationCents: 80000,
  travelCents: 30000,
  lodgingCents: 45000,
  otherCents: 0,
  reason: null,
  status: CmeStatus.PENDING,
  approvedCents: null,
  decidedAt: null,
  decisionNote: null,
  reimbursedOn: null,
  reimbursedCents: null,
  createdAt: new Date(),
  employee: person,
  decidedBy: null,
  ...overrides,
});

function build({ isProvider = true, request = row() } = {}) {
  const prisma = {
    employee: { count: jest.fn().mockResolvedValue(isProvider ? 1 : 0) },
    cmeRequest: {
      create: jest.fn().mockResolvedValue(request),
      findUnique: jest.fn().mockResolvedValue(request),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(request),
    },
  };
  const notifications = {
    cmeAsked: jest.fn().mockResolvedValue(undefined),
    personal: jest.fn().mockResolvedValue(undefined),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new CmeService(prisma as any, notifications as any);
  return { service, prisma, notifications };
}

const input = {
  title: 'AAFP FMX',
  format: CmeFormat.IN_PERSON,
  place: 'Orlando, FL',
  startsOn: '2027-03-03',
  endsOn: '2027-03-05',
  registrationCents: 80000,
  travelCents: 30000,
  lodgingCents: 45000,
  otherCents: 0,
};
const now = new Date('2026-10-21T15:00:00Z');

describe('CmeService', () => {
  it('takes a provider’s request and tells the managers, with the total', async () => {
    const { service, notifications } = build();
    const request = await service.create(input, provider, now);
    expect(request).toMatchObject({ askedCents: 155000, startsOn: '2027-03-03' });
    expect(notifications.cmeAsked).toHaveBeenCalledWith('p1', {
      title: 'Dr. Jonathan Dominguez asked for CME approval',
      body: 'AAFP FMX, Mar 3 - 5, 2027: $1,550.00',
    });
  });

  it('refuses somebody who is not a provider, and a request that does not add up', async () => {
    await expect(build({ isProvider: false }).service.create(input, provider, now)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      build().service.create({ ...input, endsOn: '2027-03-01' }, provider, now),
    ).rejects.toThrow('The last day is before the first.');
  });

  it('approves at another amount and says so, but never your own', async () => {
    const { service, prisma, notifications } = build();
    await service.approve('r1', { approvedCents: 120000 }, manager, now);
    expect(prisma.cmeRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: CmeStatus.PENDING },
      data: expect.objectContaining({ status: CmeStatus.APPROVED, approvedCents: 120000 }),
    });
    expect(notifications.personal).toHaveBeenCalledWith(['p1'], NotificationKind.CME, {
      title: 'Your CME request was approved',
      body: 'AAFP FMX, Mar 3 - 5, 2027: $1,200.00 of the $1,550.00 asked.',
      link: '/cme',
    });
    await expect(build().service.approve('r1', {}, { ...manager, id: 'p1' }, now)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('needs a reason to decline, and decides each request once', async () => {
    await expect(build().service.decline('r1', ' ', manager, now)).rejects.toThrow(
      BadRequestException,
    );
    const { service, prisma } = build();
    prisma.cmeRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.decline('r1', 'Not this year', manager, now)).rejects.toThrow(
      'That one has already been decided.',
    );
  });

  it('records paying back only an approved one, and tells them the first time', async () => {
    const approved = row({ status: CmeStatus.APPROVED, approvedCents: 155000 });
    const { service, notifications } = build({ request: approved });
    await service.reimbursed(
      'r1',
      { reimbursedOn: '2026-10-20', reimbursedCents: 150000 },
      manager,
      now,
    );
    expect(notifications.personal).toHaveBeenCalledWith(['p1'], NotificationKind.CME, {
      title: 'Your CME was paid back',
      body: 'AAFP FMX: $1,500.00.',
      link: '/cme',
    });
    await expect(
      build().service.reimbursed(
        'r1',
        { reimbursedOn: '2026-10-20', reimbursedCents: 1 },
        manager,
        now,
      ),
    ).rejects.toThrow('Only an approved request can be paid back.');
    await expect(
      service.reimbursed('r1', { reimbursedOn: '2026-10-30', reimbursedCents: 1 }, manager, now),
    ).rejects.toThrow('Record it once it has been paid.');
  });
});
