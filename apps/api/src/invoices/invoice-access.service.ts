import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus } from '@prisma/client';
import type { Request } from 'express';
import { A_PERSON } from '../common/people';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Who sees invoices (26 October 2026, Dominguez: "the only people who should
 * be able to see these invoices should be me (Jonathan Dominguez, Angelica
 * Dominguez, and Kayla Bermeo)"). A list of people (`Employee.canSeeInvoices`),
 * whatever their access level: an admin not on it is refused like anybody
 * else. It replaced "Manager access only" (21 October 2026), which let in
 * every manager. Kept on the Invoices screen by the people already on it, so
 * nobody else can put themselves on it, and nobody takes themselves off, so it
 * is never left empty.
 */
const NAME = { id: true, firstName: true, lastName: true, preferredName: true } as const;

@Injectable()
export class InvoiceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async allowed(employeeId: string) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { canSeeInvoices: true, employmentStatus: true },
    });
    return Boolean(
      person?.canSeeInvoices && person.employmentStatus !== EmploymentStatus.TERMINATED,
    );
  }

  /// Those on the list, and the people still here who could be added.
  async list() {
    const [holders, others] = await Promise.all([
      this.prisma.employee.findMany({
        where: { canSeeInvoices: true, employmentStatus: { not: EmploymentStatus.TERMINATED } },
        select: NAME,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.employee.findMany({
        where: {
          ...A_PERSON,
          canSeeInvoices: false,
          employmentStatus: { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] },
        },
        select: NAME,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);
    return { holders, others };
  }

  async add(employeeId: string) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { employmentStatus: true, isSharedAccount: true },
    });
    if (!person) throw new NotFoundException('That person is not in the app.');
    if (person.isSharedAccount)
      throw new BadRequestException('A shared account cannot see invoices.');
    if (person.employmentStatus === EmploymentStatus.TERMINATED)
      throw new BadRequestException('They have left the practice.');
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { canSeeInvoices: true },
    });
    return this.list();
  }

  async remove(employeeId: string, actorId: string) {
    if (employeeId === actorId)
      throw new BadRequestException(
        'You cannot take yourself off. Ask somebody else on the list to do it.',
      );
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('That person is not in the app.');
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { canSeeInvoices: false },
    });
    return this.list();
  }
}

/// Every invoices route: only the people on the list. Runs before the pay lock,
/// so somebody not on it is told so rather than asked for a PIN. Reads the
/// person themselves, so an admin "viewing as" somebody keeps their own answer
/// (like the rota's cost).
@Injectable()
export class InvoiceAccessGuard implements CanActivate {
  constructor(private readonly access: InvoiceAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (user && (await this.access.allowed(user.id))) return true;
    throw new ForbiddenException('Invoices are only for the people chosen to see them.');
  }
}
