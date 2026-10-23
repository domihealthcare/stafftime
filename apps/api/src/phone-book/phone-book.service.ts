import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ContactInput, OfficeInput } from './dto/contact.dto';

/**
 * The referral phone book (October 2026, Dominguez: "a searchable phone book
 * for referrals for staff to use and edit"): the labs, hospitals, imaging
 * centres, home care, equipment suppliers and specialists the practice sends
 * patients to, and the numbers for doing it. Everybody signed in reads it and
 * keeps it; a new entry is added only by a provider, a manager or an admin
 * (23 October 2026, Dominguez). About places - never a patient.
 */
@Injectable()
export class PhoneBookService {
  private readonly logger = new Logger(PhoneBookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Every entry. The book is a few hundred lines, so the screen searches it
  /// as it is typed rather than asking again.
  list() {
    return this.prisma.referralContact.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: OFFICES,
    });
  }

  /// Providers (a job role with *uses clinical forms*), managers and admins
  /// add entries. While an admin views as somebody, their chosen job roles
  /// are the ones that count, as everywhere else.
  async canAdd(actor: AuthUser): Promise<boolean> {
    if (actor.role === Role.MANAGER || actor.role === Role.ADMIN) return true;
    if (actor.viewAsJobRoleIds) {
      const count = await this.prisma.jobRole.count({
        where: { id: { in: actor.viewAsJobRoleIds }, usesClinicalForms: true },
      });
      return count > 0;
    }
    const count = await this.prisma.employeeJobRole.count({
      where: { employeeId: actor.id, jobRole: { usesClinicalForms: true } },
    });
    return count > 0;
  }

  async assertCanAdd(actor: AuthUser) {
    if (!(await this.canAdd(actor))) {
      throw new ForbiddenException(
        'Only providers, managers and admins add to the phone book. You can still fix an entry.',
      );
    }
  }

  async create(dto: ContactInput, actor: AuthUser) {
    const contact = await this.prisma.referralContact.create({
      data: {
        ...contactFields(dto),
        updatedById: actor.id,
        offices: { create: officeRows(dto.offices) },
      },
      include: OFFICES,
    });
    this.logger.log(`Phone book entry ${contact.id} added by ${actor.id}`);
    return contact;
  }

  async update(id: string, dto: ContactInput, actor: AuthUser) {
    await this.require(id);
    // The offices are sent whole, so they are replaced whole, in one step.
    const [, contact] = await this.prisma.$transaction([
      this.prisma.referralOffice.deleteMany({ where: { contactId: id } }),
      this.prisma.referralContact.update({
        where: { id },
        data: {
          ...contactFields(dto),
          updatedById: actor.id,
          offices: { create: officeRows(dto.offices) },
        },
        include: OFFICES,
      }),
    ]);
    this.logger.log(`Phone book entry ${id} changed by ${actor.id}`);
    return contact;
  }

  async remove(id: string, actor: AuthUser) {
    await this.require(id);
    await this.prisma.referralContact.delete({ where: { id } });
    this.logger.log(`Phone book entry ${id} removed by ${actor.id}`);
    return { deleted: true };
  }

  private async require(id: string) {
    const contact = await this.prisma.referralContact.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('That entry is no longer in the phone book.');
  }
}

const OFFICES = { offices: { orderBy: { sortOrder: 'asc' as const } } };

/// What is saved: text trimmed, and anything left empty is kept as nothing.
export function contactFields(dto: ContactInput) {
  return {
    category: dto.category.trim(),
    name: dto.name.trim(),
    practice: tidy(dto.practice),
    preferred: dto.preferred ?? false,
    email: tidy(dto.email),
    website: tidy(dto.website),
    notes: tidy(dto.notes),
  };
}

/// An entry's offices, in the order written, leaving out any with nothing in
/// them (a blank row left on the form).
export function officeRows(offices: OfficeInput[] = []) {
  return offices
    .map((office) => ({
      label: tidy(office.label),
      address: tidy(office.address),
      phone: tidy(office.phone),
      fax: tidy(office.fax),
    }))
    .filter((office) => office.label || office.address || office.phone || office.fax)
    .map((office, sortOrder) => ({ ...office, sortOrder }));
}

function tidy(value?: string | null) {
  return value?.trim() || null;
}
