import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InvoiceBillTo, InvoiceStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceInput, PayeeInput } from './dto/invoices.dto';
import { invoiceProblem, payeeProblem } from './invoice-rules';

const SELECT = {
  id: true,
  number: true,
  issuedOn: true,
  dueOn: true,
  billTo: true,
  billToName: true,
  billToAddress: true,
  status: true,
  paidOn: true,
  note: true,
  payToName: true,
  payToLines: true,
  payableTo: true,
  createdAt: true,
  updatedAt: true,
  lines: {
    orderBy: { sortOrder: 'asc' },
    select: { id: true, description: true, amountCents: true },
  },
} satisfies Prisma.InvoiceSelect;

type Row = Prisma.InvoiceGetPayload<{ select: typeof SELECT }>;

const PAYEE = { id: true, name: true, lines: true, payableTo: true } as const;

const day = (text: string) => new Date(`${text}T00:00:00.000Z`);

/**
 * The invoices the practice sends (October 2026, Dominguez: the Invoice
 * Template sheet). Managers and admins make, change and remove them; the PDF
 * is drawn in the browser from what is kept here, so a copy can always be
 * downloaded again. See `invoice-rules.ts` for what a patient's invoice keeps.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [rows, last] = await Promise.all([
      this.prisma.invoice.findMany({ orderBy: { number: 'desc' }, select: SELECT }),
      this.prisma.invoice.aggregate({ _max: { number: true } }),
    ]);
    return { invoices: rows.map(present), nextNumber: (last._max.number ?? 0) + 1 };
  }

  /// The saved "Pay to" options; the practice itself is not one of them.
  payees() {
    return this.prisma.invoicePayee.findMany({ orderBy: { name: 'asc' }, select: PAYEE });
  }

  async createPayee(dto: PayeeInput, actor: AuthUser) {
    const row = await this.prisma.invoicePayee.create({
      data: { ...payeeData(dto), createdById: actor.id },
      select: PAYEE,
    });
    this.logger.log(`Invoice pay-to ${row.id} saved by ${actor.id}`);
    return row;
  }

  /// Invoices already made keep the details they went out with.
  async updatePayee(id: string, dto: PayeeInput, actor: AuthUser) {
    await this.findPayee(id);
    const row = await this.prisma.invoicePayee.update({
      where: { id },
      data: payeeData(dto),
      select: PAYEE,
    });
    this.logger.log(`Invoice pay-to ${id} changed by ${actor.id}`);
    return row;
  }

  async removePayee(id: string, actor: AuthUser) {
    await this.findPayee(id);
    await this.prisma.invoicePayee.delete({ where: { id } });
    this.logger.log(`Invoice pay-to ${id} removed by ${actor.id}`);
    return { removed: true };
  }

  private async findPayee(id: string) {
    const row = await this.prisma.invoicePayee.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('That pay-to option is no longer there.');
    return row;
  }

  async create(dto: InvoiceInput, actor: AuthUser) {
    const data = this.data(dto);
    // The next number; two saved at once both try it, and the second goes on.
    for (let attempt = 0; attempt < 3; attempt++) {
      const last = await this.prisma.invoice.aggregate({ _max: { number: true } });
      try {
        const row = await this.prisma.invoice.create({
          data: {
            ...data,
            number: (last._max.number ?? 0) + 1,
            createdById: actor.id,
            lines: { create: this.lines(dto) },
          },
          select: SELECT,
        });
        this.logger.log(`Invoice ${row.number} made by ${actor.id}`);
        return present(row);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
      }
    }
    throw new BadRequestException('Another invoice was being saved at the same time. Try again.');
  }

  async update(id: string, dto: InvoiceInput, actor: AuthUser) {
    await this.find(id);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      return tx.invoice.update({
        where: { id },
        data: { ...this.data(dto), lines: { create: this.lines(dto) } },
        select: SELECT,
      });
    });
    this.logger.log(`Invoice ${row.number} changed by ${actor.id}`);
    return present(row);
  }

  async remove(id: string, actor: AuthUser) {
    const row = await this.find(id);
    await this.prisma.invoice.delete({ where: { id } });
    this.logger.log(`Invoice ${row.number} removed by ${actor.id}`);
    return { removed: true };
  }

  private async find(id: string) {
    const row = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, number: true },
    });
    if (!row) throw new NotFoundException('That invoice is no longer there.');
    return row;
  }

  private data(dto: InvoiceInput) {
    const problem = invoiceProblem(dto);
    if (problem) throw new BadRequestException(problem);
    const vendor = dto.billTo === InvoiceBillTo.VENDOR;
    const paid = dto.status === InvoiceStatus.PAID;
    const payTo = dto.payTo ? payeeData(dto.payTo) : null;
    return {
      issuedOn: day(dto.issuedOn),
      dueOn: dto.dueOn ? day(dto.dueOn) : null,
      billTo: dto.billTo,
      billToName: vendor ? (dto.billToName ?? '').trim() : null,
      billToAddress: vendor ? (dto.billToAddress ?? '').trim() || null : null,
      status: dto.status,
      paidOn: paid && dto.paidOn ? day(dto.paidOn) : null,
      note: (dto.note ?? '').trim() || null,
      payToName: payTo?.name ?? null,
      payToLines: payTo?.lines ?? null,
      payableTo: payTo?.payableTo ?? null,
    };
  }

  private lines(dto: InvoiceInput) {
    return dto.lines.map((line, index) => ({
      description: line.description.trim(),
      amountCents: line.amountCents,
      sortOrder: index,
    }));
  }
}

function payeeData(dto: PayeeInput) {
  const problem = payeeProblem(dto);
  if (problem) throw new BadRequestException(problem);
  return {
    name: dto.name.trim(),
    lines: (dto.lines ?? '').trim() || null,
    payableTo: dto.payableTo.trim(),
  };
}

function present(row: Row) {
  return {
    ...row,
    issuedOn: isoDate(row.issuedOn),
    dueOn: row.dueOn ? isoDate(row.dueOn) : null,
    paidOn: row.paidOn ? isoDate(row.paidOn) : null,
    totalCents: row.lines.reduce((sum, line) => sum + line.amountCents, 0),
  };
}
