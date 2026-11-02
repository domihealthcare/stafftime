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
import { isViewingAs } from '../common/auth/auth-user';

/**
 * Who approves expense reimbursements (1 November 2026, Dominguez: "admin (me
 * and angelica dominguez)"). A list of people (`Employee.canApproveExpenses`),
 * whatever their access level, kept on the Expenses screen by the people
 * already on it, like the invoices list: nobody else can put themselves on it,
 * and nobody takes themselves off, so it is never left empty.
 */
const NAME = { id: true, firstName: true, lastName: true, preferredName: true } as const;

@Injectable()
export class ExpenseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async allowed(employeeId: string) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { canApproveExpenses: true, employmentStatus: true },
    });
    return Boolean(
      person?.canApproveExpenses && person.employmentStatus !== EmploymentStatus.TERMINATED,
    );
  }

  /// Those on the list, and the people still here who could be added.
  async list() {
    const [holders, others] = await Promise.all([
      this.prisma.employee.findMany({
        where: { canApproveExpenses: true, employmentStatus: { not: EmploymentStatus.TERMINATED } },
        select: NAME,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.employee.findMany({
        where: {
          ...A_PERSON,
          canApproveExpenses: false,
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
      throw new BadRequestException('A shared account cannot approve expenses.');
    if (person.employmentStatus === EmploymentStatus.TERMINATED)
      throw new BadRequestException('They have left the practice.');
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { canApproveExpenses: true },
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
      data: { canApproveExpenses: false },
    });
    return this.list();
  }
}

/// The approvers' routes: only the people on the list. Reads the person
/// themselves, so an admin "viewing as" somebody keeps their own answer.
@Injectable()
export class ExpenseApproverGuard implements CanActivate {
  constructor(private readonly access: ExpenseAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (user && !isViewingAs(user) && (await this.access.allowed(user.id))) return true;
    throw new ForbiddenException('Only the people chosen to approve expenses can do that.');
  }
}
