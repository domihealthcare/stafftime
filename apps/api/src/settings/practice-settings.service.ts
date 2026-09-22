import { Injectable } from '@nestjs/common';
import { PracticeSettings, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePracticeSettingsDto } from './dto/practice-settings.dto';

/// The only value `PracticeSettings.singleton` ever takes. See the model.
const SINGLETON = 1;

/// Postgres's "duplicate key" as Prisma reports it.
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * The practice's own scheduling rules.
 *
 * Both of these were constants until somebody had an opinion about them, which
 * is the right order — but a guess that has been overruled should not need a
 * deploy to change.
 */
@Injectable()
export class PracticeSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * There is exactly one row, created on first read so a fresh database starts
   * with the defaults rather than nothing.
   *
   * Get-or-create with the unique column carrying the weight, exactly as
   * `PtoPolicyService.get` does — and for the reason written up there, which
   * was not theoretical: twenty concurrent first reads of the PTO policy
   * produced eighteen rows before the unique column was added. The schedule
   * screen reads these settings alongside coverage, so it has the same shape of
   * race available to it.
   */
  async get(): Promise<PracticeSettings> {
    const existing = await this.prisma.practiceSettings.findUnique({
      where: { singleton: SINGLETON },
    });
    if (existing) return existing;

    try {
      return await this.prisma.practiceSettings.create({ data: { singleton: SINGLETON } });
    } catch (error) {
      // Somebody else created it between the read and the write. The loser
      // reads the winner's row rather than failing.
      if (isUniqueViolation(error)) {
        return this.prisma.practiceSettings.findUniqueOrThrow({
          where: { singleton: SINGLETON },
        });
      }
      throw error;
    }
  }

  async update(
    dto: UpdatePracticeSettingsDto,
    updatedById: string,
  ): Promise<PracticeSettings> {
    await this.get();
    return this.prisma.practiceSettings.update({
      where: { singleton: SINGLETON },
      data: { ...dto, updatedById },
    });
  }
}
