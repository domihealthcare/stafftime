import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { latestUpdate, withoutUpdatedAt } from '../common/util/board-rows';
import { moveInOrder } from '../common/util/move-in-order';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReimbursementCodeInput,
  ReimbursementPayerInput,
  ReimbursementRateInput,
} from './dto/reimbursements.dto';
import { parseRate } from './rate';

/**
 * The reimbursements board (October 2026, Dominguez — the practice's
 * "Reimbursements - Domi TCHG" sheet, "a big board, but also searchable"):
 * what each insurance pays for each CPT code. The practice's money, so
 * managers and admins only, reading and keeping alike (the controller).
 */
@Injectable()
export class ReimbursementsService {
  private readonly logger = new Logger(ReimbursementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// The whole board: about 170 codes × 36 insurances, 1,650 amounts — sent
  /// at once so searching is instant.
  async board() {
    const [codes, payers, rates] = await Promise.all([
      this.prisma.reimbursementCode.findMany({
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: { id: true, code: true, description: true, updatedAt: true },
      }),
      this.prisma.reimbursementPayer.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, note: true, updatedAt: true },
      }),
      this.prisma.reimbursementRate.findMany({
        select: { codeId: true, payerId: true, amount: true, text: true, updatedAt: true },
      }),
    ]);
    const updatedAt = latestUpdate([...codes, ...payers, ...rates]);
    return {
      codes: codes.map(withoutUpdatedAt),
      payers: payers.map(withoutUpdatedAt),
      rates: rates.map((rate) => ({
        codeId: rate.codeId,
        payerId: rate.payerId,
        amount: rate.amount === null ? null : rate.amount.toString(),
        text: rate.text,
      })),
      updatedAt,
    };
  }

  async setRate(dto: ReimbursementRateInput, actor: AuthUser) {
    const [code, payer] = await Promise.all([
      this.prisma.reimbursementCode.findUnique({ where: { id: dto.codeId }, select: { id: true } }),
      this.prisma.reimbursementPayer.findUnique({
        where: { id: dto.payerId },
        select: { id: true },
      }),
    ]);
    if (!code || !payer)
      throw new NotFoundException('That code or insurance is no longer on the board.');
    const parsed = parseRate(dto.value);
    if (parsed === null) {
      await this.prisma.reimbursementRate.deleteMany({
        where: { codeId: dto.codeId, payerId: dto.payerId },
      });
    } else {
      await this.prisma.reimbursementRate.upsert({
        where: { codeId_payerId: { codeId: dto.codeId, payerId: dto.payerId } },
        create: { codeId: dto.codeId, payerId: dto.payerId, ...parsed },
        update: parsed,
      });
    }
    this.logger.log(`Reimbursements: ${dto.codeId} × ${dto.payerId} changed by ${actor.id}`);
    return this.board();
  }

  async createCode(dto: ReimbursementCodeInput, actor: AuthUser) {
    const fields = codeFields(dto);
    await this.refuseDuplicateCode(fields.code);
    const last = await this.prisma.reimbursementCode.aggregate({ _max: { sortOrder: true } });
    const code = await this.prisma.reimbursementCode.create({
      data: { ...fields, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select: { id: true },
    });
    this.logger.log(`Reimbursements: code ${code.id} added by ${actor.id}`);
    return this.board();
  }

  async updateCode(id: string, dto: ReimbursementCodeInput, actor: AuthUser) {
    await this.findCode(id);
    const fields = codeFields(dto);
    await this.refuseDuplicateCode(fields.code, id);
    await this.prisma.reimbursementCode.update({ where: { id }, data: fields });
    this.logger.log(`Reimbursements: code ${id} changed by ${actor.id}`);
    return this.board();
  }

  async removeCode(id: string, actor: AuthUser) {
    await this.findCode(id);
    await this.prisma.reimbursementCode.delete({ where: { id } });
    this.logger.log(`Reimbursements: code ${id} removed by ${actor.id}`);
    return this.board();
  }

  async moveCode(id: string, by: -1 | 1) {
    await this.findCode(id);
    const codes = await this.prisma.reimbursementCode.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { id: true },
    });
    const order = moveInOrder(
      codes.map((row) => row.id),
      id,
      by,
    );
    if (order) {
      await this.prisma.$transaction(
        order.map((codeId, index) =>
          this.prisma.reimbursementCode.update({
            where: { id: codeId },
            data: { sortOrder: index + 1 },
          }),
        ),
      );
    }
    return this.board();
  }

  async createPayer(dto: ReimbursementPayerInput, actor: AuthUser) {
    const last = await this.prisma.reimbursementPayer.aggregate({ _max: { sortOrder: true } });
    const payer = await this.prisma.reimbursementPayer.create({
      data: { ...payerFields(dto), sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select: { id: true },
    });
    this.logger.log(`Reimbursements: insurance ${payer.id} added by ${actor.id}`);
    return this.board();
  }

  async updatePayer(id: string, dto: ReimbursementPayerInput, actor: AuthUser) {
    await this.findPayer(id);
    await this.prisma.reimbursementPayer.update({ where: { id }, data: payerFields(dto) });
    this.logger.log(`Reimbursements: insurance ${id} changed by ${actor.id}`);
    return this.board();
  }

  async removePayer(id: string, actor: AuthUser) {
    await this.findPayer(id);
    await this.prisma.reimbursementPayer.delete({ where: { id } });
    this.logger.log(`Reimbursements: insurance ${id} removed by ${actor.id}`);
    return this.board();
  }

  async movePayer(id: string, by: -1 | 1) {
    await this.findPayer(id);
    const payers = await this.prisma.reimbursementPayer.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });
    const order = moveInOrder(
      payers.map((row) => row.id),
      id,
      by,
    );
    if (order) {
      await this.prisma.$transaction(
        order.map((payerId, index) =>
          this.prisma.reimbursementPayer.update({
            where: { id: payerId },
            data: { sortOrder: index + 1 },
          }),
        ),
      );
    }
    return this.board();
  }

  private async refuseDuplicateCode(code: string, except?: string) {
    const same = await this.prisma.reimbursementCode.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        ...(except ? { id: { not: except } } : {}),
      },
      select: { id: true },
    });
    if (same) throw new ConflictException(`${code} is already on the board.`);
  }

  private async findCode(id: string) {
    const code = await this.prisma.reimbursementCode.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!code) throw new NotFoundException('That code is no longer on the board.');
  }

  private async findPayer(id: string) {
    const payer = await this.prisma.reimbursementPayer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!payer) throw new NotFoundException('That insurance is no longer on the board.');
  }
}

function codeFields(dto: ReimbursementCodeInput) {
  return {
    code: dto.code.trim().replace(/\s+/g, ' '),
    description: dto.description?.trim() || null,
  };
}

function payerFields(dto: ReimbursementPayerInput) {
  return { name: dto.name.trim(), note: dto.note?.trim() || null };
}
