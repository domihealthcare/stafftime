import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { PresetOptionsDto, SaveReportPresetDto, UpdateReportPresetDto } from './dto/report-preset.dto';

const PRESET_SELECT = {
  id: true,
  name: true,
  isShared: true,
  options: true,
  ownerId: true,
  updatedAt: true,
  owner: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ReportPresetSelect;

@Injectable()
export class ReportPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  /// Your own presets plus anything shared, so a manager sees "the payroll
  /// export" whoever set it up.
  async list(user: AuthUser) {
    const presets = await this.prisma.reportPreset.findMany({
      where: { OR: [{ ownerId: user.id }, { isShared: true }] },
      select: PRESET_SELECT,
      orderBy: [{ isShared: 'desc' }, { name: 'asc' }],
    });

    return presets.map((preset) => ({
      ...preset,
      isMine: preset.ownerId === user.id,
      ownerName: `${preset.owner.firstName} ${preset.owner.lastName}`,
      owner: undefined,
    }));
  }

  async create(dto: SaveReportPresetDto, user: AuthUser) {
    try {
      return await this.prisma.reportPreset.create({
        data: {
          name: dto.name.trim(),
          isShared: dto.isShared ?? false,
          options: dto.options as unknown as Prisma.InputJsonValue,
          ownerId: user.id,
        },
        select: PRESET_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`You already have a saved report called "${dto.name}".`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateReportPresetDto, user: AuthUser) {
    await this.assertCanEdit(id, user);

    try {
      return await this.prisma.reportPreset.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          isShared: dto.isShared,
          options: dto.options
            ? (dto.options as unknown as Prisma.InputJsonValue)
            : undefined,
        },
        select: PRESET_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`You already have a saved report called "${dto.name}".`);
      }
      throw error;
    }
  }

  async remove(id: string, user: AuthUser) {
    await this.assertCanEdit(id, user);
    await this.prisma.reportPreset.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Reads a preset's stored options back into a validated DTO.
   *
   * The JSON column is only as trustworthy as whatever wrote it, so it goes
   * through the same validation as a request body before it is used.
   */
  async resolveOptions(id: string, user: AuthUser): Promise<PresetOptionsDto> {
    const preset = await this.prisma.reportPreset.findUnique({
      where: { id },
      select: { options: true, ownerId: true, isShared: true },
    });
    if (!preset || (preset.ownerId !== user.id && !preset.isShared)) {
      throw new NotFoundException('Saved report not found.');
    }

    const options = plainToInstance(PresetOptionsDto, preset.options, {
      enableImplicitConversion: false,
    });
    const errors = validateSync(options, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      throw new ConflictException(
        'That saved report is no longer valid — re-save it from the export screen.',
      );
    }
    return options;
  }

  /// A shared preset can be edited by its owner or any admin; your own is
  /// always yours.
  private async assertCanEdit(id: string, user: AuthUser) {
    const preset = await this.prisma.reportPreset.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!preset) {
      throw new NotFoundException('Saved report not found.');
    }
    if (preset.ownerId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('That saved report belongs to someone else.');
    }
  }
}
