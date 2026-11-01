import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExpenseStatus, NotificationKind, Role } from '@prisma/client';
import { ExpensesService } from './expenses.service';

const casey = { id: 'e1', email: 'casey@example.com', role: Role.EMPLOYEE };
const angelica = { id: 'a1', email: 'angelica@example.com', role: Role.ADMIN };
const person = {
  id: 'e1',
  firstName: 'Casey',
  lastName: 'Lee',
  preferredName: null,
  postNominals: null,
  photoUpdatedAt: null,
};
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'x1',
  employeeId: 'e1',
  description: 'Printer ink',
  kind: null,
  spentOn: new Date('2026-10-30T00:00:00Z'),
  amountCents: 4210,
  note: null,
  receiptEmailedAt: new Date(),
  status: ExpenseStatus.PENDING,
  approvedCents: null,
  decidedAt: null,
  decisionNote: null,
  receiptReceivedAt: null,
  paidOn: null,
  paidCents: null,
  paidHow: null,
  paidNote: null,
  payDeferredUntil: null,
  createdAt: new Date(),
  employee: person,
  decidedBy: null,
  ...overrides,
});

function build(request = row()) {
  const prisma = {
    employee: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { ...person, id: 'a1', firstName: 'Angelica', lastName: 'Dominguez', email: 'a@x.com' },
        ]),
    },
    expenseRequest: {
      create: jest.fn().mockResolvedValue(request),
      findUnique: jest.fn().mockResolvedValue(request),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const notifications = { personal: jest.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ExpensesService(prisma as any, notifications as any);
  return { service, prisma, notifications };
}

const input = {
  description: 'Printer ink',
  spentOn: '2026-10-30',
  amountCents: 4210,
  receiptEmailed: true,
};
const now = new Date('2026-11-01T15:00:00Z');

describe('ExpensesService', () => {
  it('asks the approvers, on the bell and by email', async () => {
    const { service, prisma, notifications } = build();
    await service.create(input, casey, now);
    expect(prisma.expenseRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ employeeId: 'e1', receiptEmailedAt: now }),
      }),
    );
    expect(notifications.personal).toHaveBeenCalledWith(
      ['a1'],
      NotificationKind.EXPENSE,
      expect.objectContaining({
        title: 'Casey Lee submitted a reimbursement request',
        link: '/expenses',
      }),
    );
  });

  it('refuses one without the receipt emailed', async () => {
    const { service } = build();
    await expect(service.create({ ...input, receiptEmailed: false }, casey, now)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('approves only once the receipt arrived, and never your own', async () => {
    const { service, prisma, notifications } = build();
    await expect(service.approve('x1', { receiptReceived: false }, angelica, now)).rejects.toThrow(
      BadRequestException,
    );
    await service.approve('x1', { receiptReceived: true }, angelica, now);
    expect(prisma.expenseRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'x1', status: ExpenseStatus.PENDING },
      data: expect.objectContaining({
        status: ExpenseStatus.APPROVED,
        approvedCents: 4210,
        receiptReceivedAt: now,
        decidedById: 'a1',
      }),
    });
    expect(notifications.personal.mock.calls[0][2].body).toMatch(/separately from payroll/);
    await expect(
      service.approve('x1', { receiptReceived: true }, { ...angelica, id: 'e1' }, now),
    ).rejects.toThrow(ForbiddenException);
  });

  it('declines with a reason for them', async () => {
    const { service, notifications } = build();
    await expect(service.decline('x1', ' ', angelica, now)).rejects.toThrow(BadRequestException);
    await service.decline('x1', 'Not a practice expense', angelica, now);
    expect(notifications.personal.mock.calls[0][2].body).toMatch(/Not a practice expense/);
  });
});
