import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ShiftStatus } from '@prisma/client';
import { PRACTICE_ZONE, weekStartIn } from '../common/util/zoned-time.util';
import { InboxService } from '../email/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { heldJobRole } from './held-job-role';
import { QueryShiftsDto } from './dto/query-shifts.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { OvertimeService } from './overtime.service';
import { NoticeShift, shiftNotices } from './shift-notices';
import { loadUsualShift } from './usual-hours';

const SHIFT_INCLUDE = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      photoUpdatedAt: true,
    },
  },
  location: { select: { id: true, name: true, slug: true, timezone: true } },
  jobRole: { select: { id: true, name: true, colour: true } },
} satisfies Prisma.ShiftInclude;

/// A shift's note as typed, or null when there is nothing in it.
function cleanNote(note: string | null | undefined): string | null {
  return note?.trim() || null;
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overtime: OvertimeService,
    private readonly inbox: InboxService,
  ) {}

  /// Their usual for a day, for a new shift to start on: see `usual-hours.ts`.
  usual(employeeId: string, date: string) {
    return loadUsualShift(this.prisma, employeeId, date);
  }

  /// A shift for somebody, or — with no employee — an open shift that still
  /// needs filling.
  async create(dto: CreateShiftDto, createdById: string) {
    const { startsAt, endsAt } = this.parseWindow(dto.startsAt, dto.endsAt);
    const employeeId = dto.employeeId ?? null;
    if (employeeId) {
      await this.assertEmployeeWorksAtLocation(employeeId, dto.locationId);
      await this.assertNoOverlap(employeeId, startsAt, endsAt);
    }
    // Somebody's shift is for one of their own job roles; an open one, any.
    let jobRoleId = dto.jobRoleId ?? null;
    if (employeeId) jobRoleId = await heldJobRole(this.prisma, employeeId, jobRoleId);
    else if (jobRoleId) await this.assertJobRole(jobRoleId);

    const watch = employeeId
      ? await this.watchOvertime(employeeId, [{ startsAt, locationId: dto.locationId }])
      : null;
    const shift = await this.prisma.shift.create({
      data: {
        ...dto,
        employeeId,
        jobRoleId,
        startsAt,
        endsAt,
        notes: cleanNote(dto.notes),
        createdById,
      },
      include: SHIFT_INCLUDE,
    });
    await watch?.();
    await this.tell(null, shift);
    return shift;
  }

  /// `withoutDrafts` is for staff, who never see a draft: asking for drafts
  /// then gives nothing, and asking for no status in particular leaves them out.
  async findAll(query: QueryShiftsDto, { withoutDrafts = false } = {}) {
    if (withoutDrafts && query.status === ShiftStatus.DRAFT) return [];
    return this.prisma.shift.findMany({
      where: {
        employeeId: query.employeeId,
        locationId: query.locationId,
        status: query.status ?? (withoutDrafts ? { not: ShiftStatus.DRAFT } : undefined),
        startsAt: query.from ? { gte: new Date(query.from) } : undefined,
        endsAt: query.to ? { lte: new Date(query.to) } : undefined,
      },
      include: SHIFT_INCLUDE,
      orderBy: { startsAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id }, include: SHIFT_INCLUDE });
    if (!shift) {
      throw new NotFoundException(`Shift ${id} not found`);
    }
    return shift;
  }

  async update(id: string, dto: UpdateShiftDto) {
    const existing = await this.findOne(id);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }

    // `employeeId: null` takes somebody off the shift, leaving it open;
    // absent leaves whoever is on it.
    const employeeId = dto.employeeId === undefined ? existing.employeeId : dto.employeeId;
    const locationId = dto.locationId ?? existing.locationId;
    if (employeeId) {
      if (dto.employeeId || dto.locationId) {
        await this.assertEmployeeWorksAtLocation(employeeId, locationId);
      }
      await this.assertNoOverlap(employeeId, startsAt, endsAt, id);
    }
    // Putting somebody on it, or changing its job role: one of theirs. A
    // shift left as it was keeps its role, so an old one can still be moved.
    const data: UpdateShiftDto = { ...dto };
    if (employeeId && (dto.employeeId || dto.jobRoleId !== undefined)) {
      data.jobRoleId = await heldJobRole(
        this.prisma,
        employeeId,
        dto.jobRoleId === undefined ? existing.jobRoleId : dto.jobRoleId,
      );
    } else if (dto.jobRoleId) {
      await this.assertJobRole(dto.jobRoleId);
    }

    // Assigning, moving or publishing can each put the person on it over.
    const watch = employeeId
      ? await this.watchOvertime(employeeId, [
          { startsAt: existing.startsAt, locationId: existing.locationId },
          { startsAt, locationId },
        ])
      : null;
    const shift = await this.prisma.shift.update({
      where: { id },
      // `notes: null` (or blank) clears the note; absent leaves it.
      data: {
        ...data,
        startsAt,
        endsAt,
        ...(dto.notes === undefined ? {} : { notes: cleanNote(dto.notes) }),
      },
      include: SHIFT_INCLUDE,
    });
    await watch?.();
    await this.tell(existing, shift);
    return shift;
  }

  /**
   * Takes the person's published hours for the weeks a change touches, and
   * returns what to call once the change is saved: it looks again and emails
   * them if their week has just gone past the overtime line.
   */
  private async watchOvertime(
    employeeId: string,
    touched: { startsAt: Date; locationId: string }[],
  ): Promise<() => Promise<void>> {
    const zones = new Map(
      (
        await this.prisma.location.findMany({
          where: { id: { in: [...new Set(touched.map((t) => t.locationId))] } },
          select: { id: true, timezone: true },
        })
      ).map((location) => [location.id, location.timezone]),
    );
    const startsOn = await this.overtime.workweekStartsOn();
    const weeks = [
      ...new Set(
        touched.map((t) =>
          weekStartIn(t.startsAt, zones.get(t.locationId) ?? PRACTICE_ZONE, startsOn),
        ),
      ),
    ];
    const before = await this.overtime.snapshot([employeeId], weeks);
    return () => this.overtime.announceNewOvertime(before, [employeeId], weeks);
  }

  /// Published shifts are cancelled rather than deleted so staff who already saw
  /// them on the schedule still have a record of what changed.
  async remove(id: string) {
    const shift = await this.findOne(id);
    if (shift.status === ShiftStatus.DRAFT) {
      await this.prisma.shift.delete({ where: { id } });
      return { deleted: true };
    }
    await this.prisma.shift.update({ where: { id }, data: { status: ShiftStatus.CANCELLED } });
    await this.tell(shift, null);
    return { deleted: false, status: ShiftStatus.CANCELLED };
  }

  /// Tells the people a published change affects, under the bell.
  private async tell(before: NoticeShift | null, after: NoticeShift | null) {
    for (const { employeeId, notice } of shiftNotices(before, after)) {
      await this.inbox.notify([employeeId], notice);
    }
  }

  private parseWindow(startsAtRaw: string, endsAtRaw: string) {
    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }
    return { startsAt, endsAt };
  }

  private async assertEmployeeWorksAtLocation(employeeId: string, locationId: string) {
    const assignment = await this.prisma.employeeLocation.findUnique({
      where: { employeeId_locationId: { employeeId, locationId } },
      select: { employeeId: true },
    });
    if (!assignment) {
      throw new BadRequestException(
        'Employee is not assigned to that location. Assign the location first.',
      );
    }
  }

  private async assertJobRole(jobRoleId: string) {
    const role = await this.prisma.jobRole.findUnique({
      where: { id: jobRoleId },
      select: { id: true },
    });
    if (!role) throw new BadRequestException('That job role does not exist.');
  }

  private async assertNoOverlap(
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
    ignoreShiftId?: string,
  ) {
    const clash = await this.prisma.shift.findFirst({
      where: {
        employeeId,
        id: ignoreShiftId ? { not: ignoreShiftId } : undefined,
        status: { not: ShiftStatus.CANCELLED },
        // Two windows overlap when each starts before the other ends.
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    if (clash) {
      throw new BadRequestException(
        `Employee already has a shift from ${clash.startsAt.toISOString()} to ${clash.endsAt.toISOString()}.`,
      );
    }
  }
}
