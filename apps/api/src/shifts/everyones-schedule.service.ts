import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { EmploymentStatus, PtoStatus, Role, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/// Longest stretch one request may cover: a month and a week either side.
export const MAX_SCHEDULE_DAYS = 45;

/**
 * Everybody's **published** shifts, read-only, for the people an admin has
 * switched on (`Employee.canSeeEveryonesSchedule`, October 2026, Dominguez)
 * and for managers and admins, who see the rota anyway.
 *
 * It shows what the printed rota shows and nothing more: published shifts
 * only (no drafts, no open shifts, no cancelled ones), the office and job
 * role, and time off as a bare "off" - never the kind, and never a pending
 * request. No notes, no punches, no hours worked.
 */
@Injectable()
export class EveryonesScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanSee(user: { id: string; role: Role }) {
    if (user.role === Role.ADMIN || user.role === Role.MANAGER) return;
    const person = await this.prisma.employee.findUnique({
      where: { id: user.id },
      select: { canSeeEveryonesSchedule: true, employmentStatus: true },
    });
    if (
      !person?.canSeeEveryonesSchedule ||
      person.employmentStatus === EmploymentStatus.TERMINATED
    ) {
      throw new ForbiddenException('The whole schedule is for the people an admin has chosen.');
    }
  }

  async read(fromIso: string, toIso: string) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new BadRequestException('Give a start and an end, the end after the start.');
    }
    if (to.getTime() - from.getTime() > MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(`Ask for at most ${MAX_SCHEDULE_DAYS} days at a time.`);
    }

    const [locations, shifts, leave] = await Promise.all([
      this.prisma.location.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.shift.findMany({
        where: {
          status: ShiftStatus.PUBLISHED,
          employeeId: { not: null },
          startsAt: { gte: from },
          endsAt: { lte: to },
        },
        select: {
          id: true,
          employeeId: true,
          locationId: true,
          isRemote: true,
          startsAt: true,
          endsAt: true,
          jobRole: { select: { id: true, name: true, colour: true } },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.ptoRequest.findMany({
        where: {
          status: PtoStatus.APPROVED,
          cancelledAt: null,
          startDate: { lte: to },
          endDate: { gte: from },
        },
        select: { employeeId: true, startDate: true, endDate: true },
      }),
    ]);

    const ids = new Set<string>();
    for (const shift of shifts) if (shift.employeeId) ids.add(shift.employeeId);
    for (const row of leave) ids.add(row.employeeId);
    const people = await this.prisma.employee.findMany({
      where: {
        employmentStatus: { not: EmploymentStatus.TERMINATED },
        OR: [{ id: { in: [...ids] } }, { employmentStatus: EmploymentStatus.ACTIVE }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        photoUpdatedAt: true,
        locations: { select: { locationId: true, isPrimary: true } },
        jobRoles: {
          select: { isPrimary: true, jobRole: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const day = (date: Date) => date.toISOString().slice(0, 10);
    return {
      locations,
      people: people.map((person) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        preferredName: person.preferredName,
        photoUpdatedAt: person.photoUpdatedAt,
        locationIds: person.locations.map((row) => row.locationId),
        jobRoles: person.jobRoles
          .slice()
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
          .map((row) => ({ id: row.jobRole.id, name: row.jobRole.name })),
      })),
      shifts,
      off: leave.map((row) => ({
        employeeId: row.employeeId,
        startDate: day(row.startDate),
        endDate: day(row.endDate),
      })),
    };
  }
}
