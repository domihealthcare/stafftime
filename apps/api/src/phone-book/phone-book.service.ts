import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ContactInput } from './dto/contact.dto';

/**
 * The referral phone book (October 2026, Dominguez: "a searchable phone book
 * for referrals for staff to use and edit"): the labs, hospitals, imaging
 * centres, home care, equipment suppliers and specialists the practice sends
 * patients to, and the numbers for doing it. Everybody signed in reads it and
 * keeps it. About places — never a patient.
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
    });
  }

  async create(dto: ContactInput, actor: AuthUser) {
    const contact = await this.prisma.referralContact.create({
      data: { ...contactFields(dto), updatedById: actor.id },
    });
    this.logger.log(`Phone book entry ${contact.id} added by ${actor.id}`);
    return contact;
  }

  async update(id: string, dto: ContactInput, actor: AuthUser) {
    await this.require(id);
    const contact = await this.prisma.referralContact.update({
      where: { id },
      data: { ...contactFields(dto), updatedById: actor.id },
    });
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

/// What is saved: text trimmed, and anything left empty is kept as nothing.
export function contactFields(dto: ContactInput) {
  const optional = (value?: string | null) => value?.trim() || null;
  return {
    category: dto.category.trim(),
    name: dto.name.trim(),
    phone: optional(dto.phone),
    fax: optional(dto.fax),
    address: optional(dto.address),
    email: optional(dto.email),
    website: optional(dto.website),
    notes: optional(dto.notes),
  };
}
