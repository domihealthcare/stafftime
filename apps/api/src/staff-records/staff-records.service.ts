import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmploymentChange, EmploymentChangeKind, PayRateUnit, Prisma } from '@prisma/client';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { practiceToday } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { EmploymentChangeDto, PersonalRecordDto } from './dto/staff-records.dto';

const PERSONAL_FIELDS = [
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'emergencyContactName',
  'emergencyContactRelationship',
  'emergencyContactPhone',
] as const;

type PersonalField = (typeof PERSONAL_FIELDS)[number];

export type PersonalRecord = Record<PersonalField, string | null> & {
  updatedAt: string | null;
  updatedBy: string | null;
};

export interface EmploymentChangeView {
  id: string;
  effectiveOn: string;
  kind: EmploymentChangeKind;
  position: string | null;
  payRate: number | null;
  payUnit: PayRateUnit | null;
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface StaffRecord {
  personal: PersonalRecord;
  /// Newest first.
  changes: EmploymentChangeView[];
  /// What the history says now: the latest position and the latest pay,
  /// each with the day it took effect.
  current: {
    position: { value: string; since: string } | null;
    pay: { rate: number; unit: PayRateUnit; since: string } | null;
  };
}

const PERSON_NAME = { select: { firstName: true, lastName: true } } as const;

type ChangeRow = EmploymentChange & { recordedBy: { firstName: string; lastName: string } | null };

/**
 * The admins-only side of a staff profile (October 2026, Dominguez): home
 * address, emergency contact, and pay and position over time.
 *
 * A deliberate change to *Data this app does not hold* — see CLAUDE.md. It
 * lives in its own tables and its own module so that nothing else in the API
 * can send it anywhere by accident: an Employee row goes out with rotas,
 * timesheets and the Directory; these tables are read here and nowhere else.
 * Every route is admins only, and every read is logged.
 */
@Injectable()
export class StaffRecordsService {
  private readonly logger = new Logger(StaffRecordsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(employeeId: string, viewerId: string): Promise<StaffRecord> {
    await this.assertEmployee(employeeId);
    const [personal, changes] = await Promise.all([
      this.prisma.employeePersonalRecord.findUnique({
        where: { employeeId },
        include: { updatedBy: PERSON_NAME },
      }),
      this.changesOf(employeeId),
    ]);
    this.logger.log(`Staff profile of ${employeeId} read by ${viewerId}`);

    const views = changes.map(viewOf);
    return {
      personal: {
        ...(Object.fromEntries(
          PERSONAL_FIELDS.map((field) => [field, personal?.[field] ?? null]),
        ) as Record<PersonalField, string | null>),
        updatedAt: personal?.updatedAt.toISOString() ?? null,
        updatedBy: personal?.updatedBy ? fullName(personal.updatedBy) : null,
      },
      changes: views,
      current: currentOf(views),
    };
  }

  async updatePersonal(employeeId: string, dto: PersonalRecordDto, actorId: string) {
    await this.assertEmployee(employeeId);
    const data = {
      ...(Object.fromEntries(
        PERSONAL_FIELDS.filter((field) => dto[field] !== undefined).map((field) => [
          field,
          dto[field]?.trim() || null,
        ]),
      ) as Partial<Record<PersonalField, string | null>>),
      updatedById: actorId,
    };
    await this.prisma.employeePersonalRecord.upsert({
      where: { employeeId },
      create: { employeeId, ...data },
      update: data,
    });
    this.logger.log(`Address / emergency contact of ${employeeId} changed by ${actorId}`);
    return this.get(employeeId, actorId);
  }

  async addChange(employeeId: string, dto: EmploymentChangeDto, actorId: string) {
    await this.assertEmployee(employeeId);
    await this.prisma.employmentChange.create({
      data: { employeeId, ...this.changeData(dto), recordedById: actorId },
    });
    this.logger.log(`Pay / position change added for ${employeeId} by ${actorId}`);
    return this.get(employeeId, actorId);
  }

  async updateChange(id: string, dto: EmploymentChangeDto, actorId: string) {
    const existing = await this.findChange(id);
    await this.prisma.employmentChange.update({
      where: { id },
      data: { ...this.changeData(dto), recordedById: actorId },
    });
    this.logger.log(`Pay / position change ${id} edited by ${actorId}`);
    return this.get(existing.employeeId, actorId);
  }

  async removeChange(id: string, actorId: string) {
    const existing = await this.findChange(id);
    await this.prisma.employmentChange.delete({ where: { id } });
    this.logger.log(`Pay / position change ${id} removed by ${actorId}`);
    return this.get(existing.employeeId, actorId);
  }

  // -------------------------------------------------------------------------

  /// What gets written for a change, checked: a rate needs its unit, and a
  /// row has to say something.
  private changeData(dto: EmploymentChangeDto) {
    const position = dto.position?.trim() || null;
    const note = dto.note?.trim() || null;
    const payRate = dto.payRate ?? null;
    const payUnit = dto.payUnit ?? null;
    if ((payRate === null) !== (payUnit === null)) {
      throw new BadRequestException(
        payRate === null
          ? 'Give the pay amount as well as per hour or per year.'
          : 'Say whether the pay is per hour or per year.',
      );
    }
    if (position === null && payRate === null && note === null) {
      throw new BadRequestException('Give the new position, the new pay or a note.');
    }
    return {
      effectiveOn: toUtcDate(dto.effectiveOn),
      kind: dto.kind,
      position,
      payRate: payRate === null ? null : new Prisma.Decimal(payRate),
      payUnit,
      note,
    };
  }

  private changesOf(employeeId: string): Promise<ChangeRow[]> {
    return this.prisma.employmentChange.findMany({
      where: { employeeId },
      include: { recordedBy: PERSON_NAME },
      orderBy: [{ effectiveOn: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async findChange(id: string) {
    const change = await this.prisma.employmentChange.findUnique({
      where: { id },
      select: { id: true, employeeId: true },
    });
    if (!change) throw new NotFoundException('That change is not on file any more.');
    return change;
  }

  private async assertEmployee(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
  }
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

function viewOf(row: ChangeRow): EmploymentChangeView {
  return {
    id: row.id,
    effectiveOn: isoDate(row.effectiveOn),
    kind: row.kind,
    position: row.position,
    payRate: row.payRate === null ? null : row.payRate.toNumber(),
    payUnit: row.payUnit,
    note: row.note,
    recordedBy: row.recordedBy ? fullName(row.recordedBy) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/// The latest position and the latest pay. `changes` is newest first, so the
/// first of each wins. A change dated in the future (a raise agreed for next
/// month) is not "now" until its day comes.
export function currentOf(
  changes: EmploymentChangeView[],
  today: string = isoDate(practiceToday()),
): StaffRecord['current'] {
  const inForce = changes.filter((change) => change.effectiveOn <= today);
  const position = inForce.find((change) => change.position !== null);
  const pay = inForce.find((change) => change.payRate !== null && change.payUnit !== null);
  return {
    position: position ? { value: position.position!, since: position.effectiveOn } : null,
    pay: pay ? { rate: pay.payRate!, unit: pay.payUnit!, since: pay.effectiveOn } : null,
  };
}
