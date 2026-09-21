import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const EMPLOYEE_INCLUDE = {
  locations: {
    include: { location: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.EmployeeInclude;

/// Never return credential columns to a client.
const HIDDEN_FIELDS = ['pinHash'] as const;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmployeeDto) {
    const { locationIds, primaryLocationId, ...employee } = dto;
    this.assertPrimaryIsAssigned(locationIds, primaryLocationId);

    try {
      const created = await this.prisma.employee.create({
        data: {
          ...employee,
          hireDate: new Date(employee.hireDate),
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
    const { locationIds, primaryLocationId, ...employee } = dto;
    this.assertPrimaryIsAssigned(locationIds, primaryLocationId);

    try {
      const updated = await this.prisma.employee.update({
        where: { id },
        data: {
          ...employee,
          hireDate: employee.hireDate ? new Date(employee.hireDate) : undefined,
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

  async setPin(id: string, pin: string) {
    await this.findOne(id);
    await this.prisma.employee.update({
      where: { id },
      data: { pinHash: hashPin(pin) },
    });
    return { success: true };
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
      throw new BadRequestException(
        'primaryLocationId must be one of the assigned locationIds.',
      );
    }
  }

  private translateWriteError(error: unknown, dto: CreateEmployeeDto | UpdateEmployeeDto) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
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

  private strip<T extends Record<string, unknown>>(employee: T): Omit<T, 'pinHash'> {
    const copy = { ...employee };
    for (const field of HIDDEN_FIELDS) {
      delete copy[field];
    }
    return copy;
  }
}

const PIN_KEY_LENGTH = 64;

/// scrypt with a per-PIN salt. PINs are short, so this is a stopgap for kiosk
/// login only — the auth pass should add rate limiting and lockout on top.
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(pin, salt, PIN_KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, salt, derived] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !derived) {
    return false;
  }
  const candidate = scryptSync(pin, salt, PIN_KEY_LENGTH);
  const expected = Buffer.from(derived, 'hex');
  if (candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(candidate, expected);
}

/// Stable, non-reversible fingerprint used only in logs, never for auth.
export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
