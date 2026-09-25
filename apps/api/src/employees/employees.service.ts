import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, Prisma } from '@prisma/client';
import { assertBirthday } from '../common/birthday';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ImportedEmployeeDto } from './dto/import-employees.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const EMPLOYEE_INCLUDE = {
  locations: {
    include: { location: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.EmployeeInclude;

/// Never return credential columns to a client.
const HIDDEN_FIELDS = ['pinHash', 'passwordHash'] as const;

/// Sign-in looks addresses up in lower case, so they are stored that way: an
/// address typed as "Jane.Doe@…" would otherwise never sign in.
function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmployeeDto) {
    const { locationIds, primaryLocationId, adpFileNumber, ...employee } = dto;
    this.assertPrimaryIsAssigned(locationIds, primaryLocationId);
    assertBirthday(dto.birthdayMonth, dto.birthdayDay);

    try {
      const created = await this.prisma.employee.create({
        data: {
          ...employee,
          email: normaliseEmail(employee.email),
          adpFileNumber: adpFileNumber?.trim() || null,
          hireDate: employee.hireDate ? new Date(employee.hireDate) : null,
          terminationDate: employee.terminationDate
            ? new Date(employee.terminationDate)
            : undefined,
          locations: locationIds
            ? {
                create: locationIds.map((locationId) => ({
                  locationId,
                  isPrimary: locationId === primaryLocationId,
                })),
              }
            : undefined,
        },
        include: EMPLOYEE_INCLUDE,
      });
      return this.strip(created);
    } catch (error) {
      throw this.translateWriteError(error, dto);
    }
  }

  /**
   * A whole staff list at once — the first day's set-up, pasted from a
   * spreadsheet. All or nothing: a list half-loaded is harder to finish than
   * one refused with the reason, so one bad row stops the lot and says which.
   */
  async importMany(people: ImportedEmployeeDto[]) {
    const seen = new Map<string, number>();
    people.forEach((person, index) => {
      this.assertPrimaryIsAssigned(person.locationIds, person.primaryLocationId);
      try {
        assertBirthday(person.birthdayMonth, person.birthdayDay);
      } catch (error) {
        throw new BadRequestException(
          `Row ${index + 1} (${person.email}): ${(error as Error).message}`,
        );
      }
      const email = normaliseEmail(person.email);
      const earlier = seen.get(email);
      if (earlier !== undefined) {
        throw new BadRequestException(
          `Rows ${earlier + 1} and ${index + 1} have the same email, ${email}.`,
        );
      }
      seen.set(email, index);
    });

    const existing = await this.prisma.employee.findMany({
      where: { email: { in: [...seen.keys()] } },
      select: { email: true },
    });
    if (existing.length > 0) {
      throw new ConflictException(
        `Already in the app: ${existing.map((e) => e.email).join(', ')}. Take ${
          existing.length === 1 ? 'that row' : 'those rows'
        } out and try again.`,
      );
    }

    let row = 0;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const ids: string[] = [];
        for (const [index, person] of people.entries()) {
          row = index;
          const { locationIds, primaryLocationId, adpFileNumber, jobRoleIds, ...employee } =
            person;
          const made = await tx.employee.create({
            data: {
              ...employee,
              email: normaliseEmail(employee.email),
              adpFileNumber: adpFileNumber?.trim() || null,
              hireDate: employee.hireDate ? new Date(employee.hireDate) : null,
              terminationDate: employee.terminationDate
                ? new Date(employee.terminationDate)
                : undefined,
              locations: locationIds
                ? {
                    create: locationIds.map((locationId) => ({
                      locationId,
                      isPrimary: locationId === primaryLocationId,
                    })),
                  }
                : undefined,
              jobRoles: jobRoleIds?.length
                ? { create: jobRoleIds.map((jobRoleId) => ({ jobRoleId })) }
                : undefined,
            },
            select: { id: true },
          });
          ids.push(made.id);
        }
        return ids;
      });
      return { created: created.length, ids: created };
    } catch (error) {
      const translated = this.translateWriteError(error, people[row]);
      if (translated instanceof HttpException) {
        const where = `Row ${row + 1} (${people[row].email}): `;
        throw translated instanceof ConflictException
          ? new ConflictException(where + translated.message)
          : new BadRequestException(where + translated.message);
      }
      throw translated;
    }
  }

  async findAll(params: { locationId?: string; status?: EmploymentStatus }) {
    const employees = await this.prisma.employee.findMany({
      where: {
        employmentStatus: params.status,
        locations: params.locationId ? { some: { locationId: params.locationId } } : undefined,
      },
      include: EMPLOYEE_INCLUDE,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return employees.map((employee) => this.strip(employee));
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: EMPLOYEE_INCLUDE,
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${id} not found`);
    }
    return this.strip(employee);
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    const { locationIds, primaryLocationId, adpFileNumber, ...employee } = dto;
    this.assertPrimaryIsAssigned(locationIds, primaryLocationId);
    assertBirthday(dto.birthdayMonth, dto.birthdayDay);

    try {
      const updated = await this.prisma.employee.update({
        where: { id },
        data: {
          ...employee,
          email: employee.email === undefined ? undefined : normaliseEmail(employee.email),
          adpFileNumber: adpFileNumber === undefined ? undefined : adpFileNumber?.trim() || null,
          hireDate:
            employee.hireDate === undefined
              ? undefined
              : employee.hireDate
                ? new Date(employee.hireDate)
                : null,
          terminationDate: employee.terminationDate
            ? new Date(employee.terminationDate)
            : undefined,
          // Location assignments are replaced wholesale when provided.
          locations: locationIds
            ? {
                deleteMany: {},
                create: locationIds.map((locationId) => ({
                  locationId,
                  isPrimary: locationId === primaryLocationId,
                })),
              }
            : undefined,
        },
        include: EMPLOYEE_INCLUDE,
      });
      return this.strip(updated);
    } catch (error) {
      throw this.translateWriteError(error, dto);
    }
  }

  /// Employees are never hard-deleted — timesheets must stay attributable.
  async terminate(id: string, terminationDate?: string) {
    await this.findOne(id);
    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        employmentStatus: EmploymentStatus.TERMINATED,
        terminationDate: terminationDate ? new Date(terminationDate) : new Date(),
      },
      include: EMPLOYEE_INCLUDE,
    });
    return this.strip(updated);
  }

  async isAssignedToLocation(employeeId: string, locationId: string): Promise<boolean> {
    const assignment = await this.prisma.employeeLocation.findUnique({
      where: { employeeId_locationId: { employeeId, locationId } },
      select: { employeeId: true },
    });
    return assignment !== null;
  }

  private assertPrimaryIsAssigned(locationIds?: string[], primaryLocationId?: string) {
    if (primaryLocationId && !locationIds?.includes(primaryLocationId)) {
      throw new BadRequestException('primaryLocationId must be one of the assigned locationIds.');
    }
  }

  private translateWriteError(error: unknown, dto: CreateEmployeeDto | UpdateEmployeeDto) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        if (target.includes('adpFileNumber')) {
          return new ConflictException('Somebody else already has that ADP File #.');
        }
        return new ConflictException(`An employee with that ${target} already exists.`);
      }
      if (error.code === 'P2003' || error.code === 'P2025') {
        return new BadRequestException(
          `One or more locationIds do not exist: ${dto.locationIds?.join(', ') ?? ''}`,
        );
      }
    }
    return error;
  }

  /**
   * Removes credential columns and replaces them with the one fact a client
   * legitimately needs: whether a kiosk PIN exists. The hash itself never
   * crosses the wire.
   */
  private strip<T extends Record<string, unknown>>(
    employee: T,
  ): Omit<T, 'pinHash' | 'passwordHash'> & { hasKioskPin: boolean; hasPassword: boolean } {
    const copy = {
      ...employee,
      hasKioskPin: employee.pinHash !== null,
      // Whether they have chosen a password yet — i.e. whether a welcome email
      // is still worth sending. The hash itself never leaves.
      hasPassword: employee.passwordHash !== null && employee.passwordHash !== undefined,
    };
    for (const field of HIDDEN_FIELDS) {
      delete copy[field];
    }
    return copy;
  }
}
