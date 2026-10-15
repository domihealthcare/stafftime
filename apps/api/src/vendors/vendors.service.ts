import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, VendorPaymentMethod, VendorPaymentStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';
import { VendorInput, VendorPaymentInput } from './dto/vendor.dto';

const PAYMENT_SELECT = {
  id: true,
  vendorId: true,
  forWhat: true,
  invoiceNumber: true,
  method: true,
  checkNumber: true,
  amount: true,
  status: true,
  sentOn: true,
  completedOn: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VendorPaymentSelect;

type PaymentRow = Prisma.VendorPaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

/**
 * Vendor payments (October 2026, Dominguez — in place of the "Payments to
 * vendors" spreadsheet): each vendor or contractor, and every invoice, check
 * or cash payment to them, with whether it has gone out and cleared. Admins
 * only. Money and paperwork only — never a patient's name.
 */
@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Every vendor with their payments, newest first.
  async list() {
    const vendors = await this.prisma.vendor.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        payments: { select: PAYMENT_SELECT, orderBy: [{ createdAt: 'desc' }] },
      },
    });
    return vendors.map(({ payments, ...vendor }) => ({
      ...vendor,
      payments: payments.map(present),
      // Not yet cleared, and what is still owed.
      outstanding: payments.filter((p) => p.status !== VendorPaymentStatus.COMPLETED).length,
    }));
  }

  async createVendor(dto: VendorInput, actor: AuthUser) {
    const vendor = await this.prisma.vendor.create({ data: vendorFields(dto) });
    this.logger.log(`Vendor ${vendor.id} added by ${actor.id}`);
    return vendor;
  }

  async updateVendor(id: string, dto: VendorInput, actor: AuthUser) {
    await this.requireVendor(id);
    const vendor = await this.prisma.vendor.update({ where: { id }, data: vendorFields(dto) });
    this.logger.log(`Vendor ${id} changed by ${actor.id}`);
    return vendor;
  }

  /// Removes a vendor and every payment to them. Archiving (active: false)
  /// keeps the record; this is for one added by mistake.
  async removeVendor(id: string, actor: AuthUser) {
    await this.requireVendor(id);
    await this.prisma.vendor.delete({ where: { id } });
    this.logger.log(`Vendor ${id} removed by ${actor.id}`);
    return { deleted: true };
  }

  async createPayment(vendorId: string, dto: VendorPaymentInput, actor: AuthUser) {
    await this.requireVendor(vendorId);
    const payment = await this.prisma.vendorPayment.create({
      data: { ...paymentFields(dto), vendorId, createdById: actor.id },
      select: PAYMENT_SELECT,
    });
    this.logger.log(`Vendor payment ${payment.id} added by ${actor.id}`);
    return present(payment);
  }

  async updatePayment(id: string, dto: VendorPaymentInput, actor: AuthUser) {
    await this.requirePayment(id);
    const payment = await this.prisma.vendorPayment.update({
      where: { id },
      data: paymentFields(dto),
      select: PAYMENT_SELECT,
    });
    this.logger.log(`Vendor payment ${id} changed by ${actor.id}`);
    return present(payment);
  }

  async removePayment(id: string, actor: AuthUser) {
    await this.requirePayment(id);
    await this.prisma.vendorPayment.delete({ where: { id } });
    this.logger.log(`Vendor payment ${id} removed by ${actor.id}`);
    return { deleted: true };
  }

  private async requireVendor(id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id }, select: { id: true } });
    if (!vendor) throw new NotFoundException('That vendor is no longer on the list.');
  }

  private async requirePayment(id: string) {
    const payment = await this.prisma.vendorPayment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!payment) throw new NotFoundException('That payment is no longer on the list.');
  }
}

function vendorFields(dto: VendorInput) {
  return {
    name: dto.name.trim(),
    address: dto.address?.trim() || null,
    details: dto.details?.trim() || null,
    active: dto.active ?? true,
  };
}

/// What is saved: a check needs no number to be owed, but cash has none; the
/// day it was sent is optional, but "completed" always has a day it was done.
export function paymentFields(dto: VendorPaymentInput) {
  const sentOn = dto.sentOn ? new Date(`${dto.sentOn}T00:00:00.000Z`) : null;
  const completedOn = dto.completedOn ? new Date(`${dto.completedOn}T00:00:00.000Z`) : null;
  if (dto.status === VendorPaymentStatus.COMPLETED && !completedOn) {
    throw new BadRequestException('Say the day it was completed — received and deposited.');
  }
  if (sentOn && completedOn && completedOn < sentOn) {
    throw new BadRequestException('It cannot be completed before it was sent.');
  }
  return {
    forWhat: dto.forWhat.trim(),
    invoiceNumber: dto.invoiceNumber?.trim() || null,
    method: dto.method,
    checkNumber: dto.method === VendorPaymentMethod.CHECK ? dto.checkNumber?.trim() || null : null,
    amount: dto.amount ?? null,
    status: dto.status,
    sentOn,
    completedOn: dto.status === VendorPaymentStatus.COMPLETED ? completedOn : null,
    note: dto.note?.trim() || null,
  };
}

function present(payment: PaymentRow) {
  return {
    ...payment,
    amount: payment.amount === null ? null : Number(payment.amount),
    sentOn: payment.sentOn ? isoDate(payment.sentOn) : null,
    completedOn: payment.completedOn ? isoDate(payment.completedOn) : null,
  };
}
