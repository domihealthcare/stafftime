import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ReferenceAudience, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceTableInput } from './dto/reference.dto';
import { parsePastedTable } from './paste';

/// Big enough for the fee schedule (171 codes × 38 insurers) many times over.
export const MAX_ROWS = 2000;
export const MAX_COLUMNS = 100;
export const MAX_CELL = 500;

const SUMMARY = {
  id: true,
  title: true,
  notes: true,
  audience: true,
  headerRows: true,
  keyColumns: true,
  sortOrder: true,
  updatedAt: true,
} satisfies Prisma.ReferenceTableSelect;

/**
 * Reference tables (October 2026, Dominguez): the practice's spreadsheets of
 * facts to look up — the diagnostics guide, the fee schedule — pasted in from
 * the spreadsheet and kept here. Everybody reads the ones for everyone;
 * managers and admins read all and keep them.
 */
@Injectable()
export class ReferenceService {
  private readonly logger = new Logger(ReferenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// The tables the viewer may read, without their rows.
  async list(viewer: AuthUser) {
    const tables = await this.prisma.referenceTable.findMany({
      where: manages(viewer) ? {} : { audience: ReferenceAudience.EVERYONE },
      select: { ...SUMMARY, rows: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
    return tables.map(({ rows, ...table }) => {
      const cells = rows as string[][];
      return {
        ...table,
        rowCount: Math.max(0, cells.length - table.headerRows),
        columnCount: cells.reduce((max, row) => Math.max(max, row.length), 0),
      };
    });
  }

  async get(id: string, viewer: AuthUser) {
    const table = await this.prisma.referenceTable.findUnique({
      where: { id },
      select: { ...SUMMARY, rows: true },
    });
    // Somebody it is not for never learns it exists.
    if (!table || (table.audience !== ReferenceAudience.EVERYONE && !manages(viewer))) {
      throw new NotFoundException('That table no longer exists.');
    }
    return { ...table, rows: table.rows as string[][] };
  }

  async create(dto: ReferenceTableInput, actor: AuthUser) {
    const rows = checkRows(dto);
    const last = await this.prisma.referenceTable.aggregate({ _max: { sortOrder: true } });
    const table = await this.prisma.referenceTable.create({
      data: {
        ...fields(dto),
        rows,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
        updatedById: actor.id,
      },
      select: { id: true },
    });
    this.logger.log(`Reference table ${table.id} added by ${actor.id} (${rows.length} rows)`);
    return this.get(table.id, actor);
  }

  async update(id: string, dto: ReferenceTableInput, actor: AuthUser) {
    await this.get(id, actor);
    const rows = checkRows(dto);
    await this.prisma.referenceTable.update({
      where: { id },
      data: { ...fields(dto), rows, updatedById: actor.id },
    });
    this.logger.log(`Reference table ${id} changed by ${actor.id} (${rows.length} rows)`);
    return this.get(id, actor);
  }

  async remove(id: string, actor: AuthUser) {
    await this.get(id, actor);
    await this.prisma.referenceTable.delete({ where: { id } });
    this.logger.log(`Reference table ${id} removed by ${actor.id}`);
    return { deleted: true };
  }
}

function manages(viewer: AuthUser): boolean {
  return viewer.role === Role.MANAGER || viewer.role === Role.ADMIN;
}

function fields(dto: ReferenceTableInput) {
  return {
    title: dto.title.trim(),
    notes: dto.notes?.trim() || null,
    audience: dto.audience,
    headerRows: dto.headerRows,
    keyColumns: dto.keyColumns,
  };
}

/// The rows to save: pasted text read into rows, or the rows sent — every
/// cell text, and none of it too big.
export function checkRows(dto: Pick<ReferenceTableInput, 'pasted' | 'rows'>): string[][] {
  let rows: unknown[];
  if (dto.pasted !== undefined) {
    rows = parsePastedTable(dto.pasted);
  } else if (dto.rows !== undefined) {
    rows = dto.rows;
  } else {
    throw new BadRequestException('Paste the table from the spreadsheet.');
  }
  if (rows.length === 0) {
    throw new BadRequestException('Nothing was pasted — copy the cells in the spreadsheet first.');
  }
  if (rows.length > MAX_ROWS) {
    throw new BadRequestException(`That is ${rows.length} rows; a table can have ${MAX_ROWS}.`);
  }
  return rows.map((row, index) => {
    if (!Array.isArray(row) || row.some((cell) => typeof cell !== 'string')) {
      throw new BadRequestException(`Row ${index + 1} is not a row of text.`);
    }
    if (row.length > MAX_COLUMNS) {
      throw new BadRequestException(
        `Row ${index + 1} has ${row.length} columns; a table can have ${MAX_COLUMNS}.`,
      );
    }
    return (row as string[]).map((cell) => {
      const text = cell.trim();
      if (text.length > MAX_CELL) {
        throw new BadRequestException(
          `A cell in row ${index + 1} is longer than ${MAX_CELL} characters.`,
        );
      }
      return text;
    });
  });
}
