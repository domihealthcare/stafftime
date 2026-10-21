import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PtoStatus, Role, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import {
  addDaysTo,
  datesBetween,
  localDateIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { named, PERSON, WORKING } from '../on-call/on-call.service';
import { PrismaService } from '../prisma/prisma.service';
import { OfficeAdminDayInput, OfficeAdminPatternInput } from './dto/office-admins.dto';
import { adminOn, adminRules, concernsFor } from './office-admins';

const MAX_DAYS = 31;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const isManager = (user: AuthUser) => user.role === Role.MANAGER || user.role === Role.ADMIN;

/**
 * Who is the admin in each office, day by day (October 2026, Dominguez: "an
 * admin in WNY location daily except Friday"). The rules are in
 * `office-admins.ts`; this reads and writes them. Everybody signed in reads
 * it; managers and admins change it, and also see whether that person is off
 * or not on the rota there that day.
 */
@Injectable()
export class OfficeAdminsService {
  private readonly logger = new Logger(OfficeAdminsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Day by day, each office's admin. Only offices with a usual pattern or a
  /// changed day in the range.
  async days(from: string, to: string, viewer: AuthUser) {
    if (!DATE_ONLY.test(from ?? '') || !DATE_ONLY.test(to ?? '') || to < from) {
      throw new BadRequestException(
        'Give the days as from and to, the first no later than the last.',
      );
    }
    if (addDaysTo(from, MAX_DAYS - 1) < to) {
      throw new BadRequestException(`At most ${MAX_DAYS} days at a time.`);
    }
    const [usual, changed, present] = await Promise.all([
      this.prisma.officeAdmin.findMany({
        select: { locationId: true, weekday: true, employeeId: true },
      }),
      this.prisma.officeAdminDay.findMany({
        where: { date: { gte: toUtcDate(from), lte: toUtcDate(to) } },
        select: { date: true, locationId: true, employeeId: true, note: true },
      }),
      this.prisma.employee.findMany({
        where: { employmentStatus: { in: WORKING } },
        select: { id: true },
      }),
    ]);
    const rules = adminRules(
      usual,
      changed.map((row) => ({ ...row, date: isoDate(row.date) })),
      present.map((row) => row.id),
    );
    const officeIds = [
      ...new Set([...usual.map((row) => row.locationId), ...changed.map((row) => row.locationId)]),
    ];
    const offices = officeIds.length
      ? await this.prisma.location.findMany({
          where: { id: { in: officeIds } },
          select: { id: true, name: true, timezone: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const days = datesBetween(from, to).map((date) => ({
      date,
      admins: offices.map((office) => adminOn(date, office.id, rules)),
    }));
    const ids = [
      ...new Set(
        days.flatMap((day) => day.admins.flatMap((a) => (a.employeeId ? [a.employeeId] : []))),
      ),
    ];
    const people = ids.length
      ? new Map(
          (await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: PERSON })).map(
            (row) => [row.id, named(row)],
          ),
        )
      : new Map<string, ReturnType<typeof named>>();
    const facts = isManager(viewer) ? await this.facts(ids, officeIds, from, to) : null;

    return {
      offices: offices.map(({ id, name }) => ({ id, name })),
      days: days.map((day) => ({
        date: day.date,
        admins: day.admins.map((admin) => ({
          locationId: admin.locationId,
          person: admin.employeeId ? (people.get(admin.employeeId) ?? null) : null,
          source: admin.source,
          note: admin.note,
          usualDay: admin.usualDay,
          // Managers only: worth a look before the day.
          ...(facts
            ? {
                concerns: concernsFor(admin, {
                  onRota:
                    !!admin.employeeId &&
                    facts.onRota.has(`${admin.employeeId}|${admin.locationId}|${day.date}`),
                  off: admin.employeeId
                    ? (facts.off.get(`${admin.employeeId}|${day.date}`) ?? null)
                    : null,
                }),
              }
            : {}),
        })),
      })),
    };
  }

  /// The usual pattern, with every office and who can be picked.
  async pattern() {
    const [offices, entries, people] = await Promise.all([
      this.prisma.location.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.officeAdmin.findMany({
        where: { employee: { employmentStatus: { in: WORKING } } },
        select: { locationId: true, weekday: true, employeeId: true },
        orderBy: [{ locationId: 'asc' }, { weekday: 'asc' }],
      }),
      this.prisma.employee.findMany({
        where: { employmentStatus: { in: WORKING } },
        select: PERSON,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);
    return { offices, entries, people: people.map(named) };
  }

  /// The whole usual pattern, replacing what was there.
  async savePattern(dto: OfficeAdminPatternInput, actor: AuthUser) {
    const keys = new Set<string>();
    for (const entry of dto.entries) {
      const key = `${entry.locationId}|${entry.weekday}`;
      if (keys.has(key)) throw new BadRequestException('One admin per office a day.');
      keys.add(key);
    }
    await this.assertOffices(dto.entries.map((entry) => entry.locationId));
    await this.assertPeople(dto.entries.map((entry) => entry.employeeId));
    await this.prisma.$transaction([
      this.prisma.officeAdmin.deleteMany({}),
      this.prisma.officeAdmin.createMany({ data: dto.entries }),
    ]);
    this.logger.log(`Office admin pattern saved by ${actor.id}`);
    return this.pattern();
  }

  /// One office on one date: somebody else, or nobody. Today or later.
  async setDay(
    date: string,
    locationId: string,
    dto: OfficeAdminDayInput,
    actor: AuthUser,
    now = new Date(),
  ) {
    this.assertNotPast(date, now);
    await this.assertOffices([locationId]);
    const employeeId = dto.employeeId ?? null;
    if (employeeId) await this.assertPeople([employeeId]);
    const note = dto.note?.trim() || null;
    await this.prisma.officeAdminDay.upsert({
      where: { date_locationId: { date: toUtcDate(date), locationId } },
      create: { date: toUtcDate(date), locationId, employeeId, note, setById: actor.id },
      update: { employeeId, note, setById: actor.id },
    });
    return this.days(date, date, actor);
  }

  /// Back to the usual pattern for that day.
  async clearDay(date: string, locationId: string, actor: AuthUser, now = new Date()) {
    this.assertNotPast(date, now);
    await this.prisma.officeAdminDay.deleteMany({ where: { date: toUtcDate(date), locationId } });
    return this.days(date, date, actor);
  }

  // ---------------------------------------------------------------- helpers

  /// Who is on the rota at which office on which day (drafts count, working
  /// from home does not), and who is off.
  private async facts(ids: string[], officeIds: string[], from: string, to: string) {
    const onRota = new Set<string>();
    const off = new Map<string, 'FULL' | 'HALF'>();
    if (ids.length === 0) return { onRota, off };
    const [shifts, timeOff] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          employeeId: { in: ids },
          locationId: { in: officeIds },
          isRemote: false,
          status: { not: ShiftStatus.CANCELLED },
          startsAt: {
            gte: zonedTimeToUtc(from, '00:00', PRACTICE_ZONE),
            lt: zonedTimeToUtc(addDaysTo(to, 1), '00:00', PRACTICE_ZONE),
          },
        },
        select: {
          employeeId: true,
          locationId: true,
          startsAt: true,
          location: { select: { timezone: true } },
        },
      }),
      this.prisma.ptoRequest.findMany({
        where: {
          employeeId: { in: ids },
          status: PtoStatus.APPROVED,
          startDate: { lte: toUtcDate(to) },
          endDate: { gte: toUtcDate(from) },
        },
        select: { employeeId: true, startDate: true, endDate: true, isHalfDay: true },
      }),
    ]);
    for (const shift of shifts) {
      onRota.add(
        `${shift.employeeId}|${shift.locationId}|${localDateIn(shift.startsAt, shift.location.timezone)}`,
      );
    }
    for (const request of timeOff) {
      for (const date of datesBetween(isoDate(request.startDate), isoDate(request.endDate))) {
        if (date < from || date > to) continue;
        const key = `${request.employeeId}|${date}`;
        if (off.get(key) !== 'FULL') off.set(key, request.isHalfDay ? 'HALF' : 'FULL');
      }
    }
    return { onRota, off };
  }

  private assertNotPast(date: string, now: Date) {
    if (!DATE_ONLY.test(date)) throw new BadRequestException('Give the day as a date.');
    if (date < localDateIn(now, PRACTICE_ZONE)) {
      throw new BadRequestException(
        'Change today or a later day - earlier days stay as they were.',
      );
    }
  }

  private async assertOffices(ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await this.prisma.location.count({ where: { id: { in: unique } } });
    if (count !== unique.length) throw new BadRequestException('That office no longer exists.');
  }

  private async assertPeople(ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await this.prisma.employee.count({
      where: { id: { in: unique }, employmentStatus: { in: WORKING } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('The admin has to be somebody still here.');
    }
  }
}
