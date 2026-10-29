import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { DowntimeService } from '../downtime/downtime.service';
import { InboxService } from '../email/inbox.service';
import { PtoService } from '../pto/pto.service';
import { BadgesController } from './badges.controller';

/// The badges route is built from the real services, over a stand-in
/// database, so the rules it answers by are the ones the separate routes use.
function build() {
  const office = { id: 'nb', name: 'North Bergen' };
  const row = (id: string, announcedAt: Date | null) => ({
    id,
    systems: ['ECW'],
    note: null,
    planned: announcedAt === null,
    startsAt: new Date('2026-10-29T13:00:00Z'),
    plannedEndsAt: null,
    announcedAt,
    endedAt: null,
    cause: null,
    causeNote: null,
    catchUpPlan: null,
    catchUpDueOn: null,
    caughtUpAt: null,
    shreddedAt: null,
    startedById: 'boss',
    startedBy: { id: 'boss', firstName: 'Morgan', lastName: 'Lee', preferredName: null },
    endedBy: null,
    caughtUpBy: null,
    shreddedBy: null,
    locations: [{ location: office }],
    updates: [],
    contactsMade: [],
    _count: { recipients: 4 },
  });
  const prisma = {
    notification: { count: jest.fn().mockResolvedValue(3) },
    ptoRequest: { count: jest.fn().mockResolvedValue(2) },
    downtime: {
      findMany: jest
        .fn()
        .mockResolvedValue([row('on-now', new Date('2026-10-29T13:00:00Z')), row('later', null)]),
    },
    location: { count: jest.fn().mockResolvedValue(2) },
    employeeLocation: { findMany: jest.fn().mockResolvedValue([{ locationId: 'nb' }]) },
    downtimeContact: { findMany: jest.fn().mockResolvedValue([]) },
    employeeJobRole: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const controller = new BadgesController(
    new InboxService(prisma as never, {} as never),
    new DowntimeService(prisma as never, {} as never),
    new PtoService(prisma as never, {} as never, {} as never),
  );
  return { controller, prisma };
}

const employee: AuthUser = { id: 'me', email: 'me@example.com', role: Role.EMPLOYEE };
const manager: AuthUser = { id: 'boss', email: 'boss@example.com', role: Role.MANAGER };
const admin: AuthUser = { id: 'top', email: 'top@example.com', role: Role.ADMIN };

describe('GET /badges', () => {
  it('is open to anybody signed in (no access level asked)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, BadgesController.prototype.badges) as
      Role[] | undefined;
    expect(roles).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, BadgesController)).toBeUndefined();
  });

  it('counts only your own unread notifications', async () => {
    const { controller, prisma } = build();
    const answer = await controller.badges(employee);
    expect(answer.unread).toBe(3);
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { employeeId: 'me', readAt: null },
    });
  });

  it('gives Employee access no time-off count, and does not ask for one', async () => {
    const { controller, prisma } = build();
    const answer = await controller.badges(employee);
    expect(answer.timeOffPending).toBe(0);
    expect(prisma.ptoRequest.count).not.toHaveBeenCalled();
  });

  it.each([
    ['a manager', manager],
    ['an admin', admin],
  ])('gives %s the requests waiting, never counting their own', async (_, user) => {
    const { controller, prisma } = build();
    const answer = await controller.badges(user);
    expect(answer.timeOffPending).toBe(2);
    expect(prisma.ptoRequest.count).toHaveBeenCalledWith({
      where: { status: 'PENDING', employeeId: { not: user.id } },
    });
  });

  it('an admin viewing as Employee gets no time-off count', async () => {
    const { controller, prisma } = build();
    const answer = await controller.badges({
      ...admin,
      role: Role.EMPLOYEE,
      actualRole: Role.ADMIN,
    });
    expect(answer.timeOffPending).toBe(0);
    expect(prisma.ptoRequest.count).not.toHaveBeenCalled();
  });

  it('shows staff the downtimes at their own offices, and only the ones on now', async () => {
    const { controller, prisma } = build();
    const answer = await controller.badges(employee);
    expect(answer.downtime.map((d) => d.id)).toEqual(['on-now']);
    const where = prisma.downtime.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({
      OR: [
        { locations: { some: { locationId: { in: ['nb'] } } } },
        { recipients: { some: { employeeId: 'me' } } },
      ],
    });
    expect(where.AND[1]).toEqual({ endedAt: null });
    // The managers' log is not theirs.
    expect(answer.downtime[0].contactsMade).toEqual([]);
    expect(answer.downtime[0].toldCount).toBeNull();
  });

  it('shows managers every downtime, as the red bar did', async () => {
    const { controller, prisma } = build();
    const answer = await controller.badges(manager);
    expect(answer.downtime.map((d) => d.id)).toEqual(['on-now']);
    expect(prisma.downtime.findMany.mock.calls[0][0].where.AND[0]).toEqual({});
    expect(prisma.employeeLocation.findMany).not.toHaveBeenCalled();
  });

  it('gives the bar what /downtime/current gives as active, and reads no more', async () => {
    const { controller, prisma } = build();
    const badges = await controller.badges(manager);
    // Nothing the Downtime page alone needs: no contacts, no procedures.
    expect(prisma.downtimeContact.findMany).not.toHaveBeenCalled();
    expect(prisma.employeeJobRole.findMany).not.toHaveBeenCalled();
    const current = await new DowntimeService(prisma as never, {} as never).current(manager);
    // `minutes` is worked out to the moment of asking, so it is left aside.
    const plain = (views: { minutes: number }[]) =>
      JSON.parse(JSON.stringify(views.map((view) => ({ ...view, minutes: 0 }))));
    expect(plain(badges.downtime)).toEqual(plain(current.active));
  });
});
