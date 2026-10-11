import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, PayRateUnit, ShiftStatus } from '@prisma/client';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import {
  addDaysTo,
  localDateIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { workweekStartsOn } from '../settings/pay-period';
import { PracticeSettingsService } from '../settings/practice-settings.service';
import { overtimeSpan, rotaCost, type CostPerson } from './rota-cost';

/// The most a screen asks for at once: a month, with the days around it.
const MAX_DAYS = 62;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the rota and pay for `rota-cost.ts`, for the people an admin has
 * chosen (`Employee.canSeeRotaCost`). Here, beside the staff profiles,
 * because pay over time is only ever read from this module.
 */
@Injectable()
export class RotaCostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PracticeSettingsService,
  ) {}

  async cost(employeeId: string, from: string, to: string) {
    await this.assertAllowed(employeeId);
    if (!DATE_ONLY.test(from ?? '') || !DATE_ONLY.test(to ?? '') || to < from) {
      throw new BadRequestException(
        'Give the days as from and to, the first no later than the last.',
      );
    }
    if (addDaysTo(from, MAX_DAYS) < to) {
      throw new BadRequestException(`At most ${MAX_DAYS} days at a time.`);
    }

    const { overtimeThresholdHours, payPeriodStart } = await this.settings.get();
    const startsOn = workweekStartsOn(payPeriodStart);
    const span = overtimeSpan(from, to, startsOn);

    const [shifts, people, locations] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          employeeId: { not: null },
          status: { in: [ShiftStatus.DRAFT, ShiftStatus.PUBLISHED] },
          startsAt: {
            gte: zonedTimeToUtc(span.from, '00:00', PRACTICE_ZONE),
            lt: zonedTimeToUtc(addDaysTo(span.to, 1), '00:00', PRACTICE_ZONE),
          },
        },
        select: { employeeId: true, locationId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.employee.findMany({
        where: {
          OR: [
            { employmentStatus: { not: EmploymentStatus.TERMINATED } },
            { terminationDate: { gte: toUtcDate(from) } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          payType: true,
          hireDate: true,
          terminationDate: true,
          locations: { select: { locationId: true }, orderBy: { locationId: 'asc' } },
          employmentChanges: {
            where: { payRate: { not: null }, effectiveOn: { lte: toUtcDate(span.to) } },
            select: { effectiveOn: true, payRate: true, payUnit: true, createdAt: true },
            orderBy: [{ effectiveOn: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
      this.prisma.location.findMany({ select: { id: true, name: true } }),
    ]);

    const costPeople: CostPerson[] = people.map((person) => ({
      id: person.id,
      name: `${person.preferredName ?? person.firstName} ${person.lastName}`,
      payType: person.payType,
      mainLocationId: person.locations[0]?.locationId ?? null,
      hiredOn: person.hireDate ? isoDate(person.hireDate) : null,
      leftOn: person.terminationDate ? isoDate(person.terminationDate) : null,
      rates: person.employmentChanges.map((change) => ({
        from: isoDate(change.effectiveOn),
        rate: Number(change.payRate),
        unit: change.payUnit ?? PayRateUnit.HOURLY,
      })),
    }));

    const result = rotaCost({
      from,
      to,
      thresholdHours: overtimeThresholdHours,
      workweekStartsOn: startsOn,
      people: costPeople,
      shifts: shifts.map((shift) => ({
        employeeId: shift.employeeId as string,
        locationId: shift.locationId,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        date: localDateIn(shift.startsAt, PRACTICE_ZONE),
      })),
    });
    const names = new Map(locations.map((location) => [location.id, location.name]));
    return {
      ...result,
      byLocation: result.byLocation.map((row) => ({
        ...row,
        name: row.locationId
          ? (names.get(row.locationId) ?? 'An office since removed')
          : 'No office',
      })),
    };
  }

  // ------------------------------------------------- who may see it (admins)

  async accessList() {
    return this.prisma.employee.findMany({
      where: { canSeeRotaCost: true },
      select: { id: true, firstName: true, lastName: true, preferredName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async setAccess(employeeId: string, allowed: boolean) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('That person is not in the app.');
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { canSeeRotaCost: allowed },
    });
    return this.accessList();
  }

  private async assertAllowed(employeeId: string) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { canSeeRotaCost: true },
    });
    if (!person?.canSeeRotaCost) {
      throw new ForbiddenException('The rota’s cost is only for the people an admin has chosen.');
    }
  }
}
