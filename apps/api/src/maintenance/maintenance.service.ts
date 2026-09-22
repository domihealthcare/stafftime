import { Injectable, Logger } from '@nestjs/common';
import { LoginThrottleService } from '../auth/login-throttle.service';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';

/// An unreferenced file younger than this is left alone: it may belong to an
/// upload that is still in flight, between the storage write and the metadata
/// row landing.
const ORPHAN_GRACE_MINUTES = 60;

export interface PurgeReport {
  expiredSessions: number;
  staleLoginAttempts: number;
  expiredPairingCodes: number;
  orphanedFiles: number;
}

/**
 * Housekeeping that nothing else has a reason to do.
 *
 * None of this is urgent, and none of it can be left forever: expired sessions
 * accumulate a row per sign-in, the throttle table grows with every wrong
 * password, and a pairing code that was never used is a live credential sitting
 * in the database.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
  ) {}

  async purge(): Promise<PurgeReport> {
    const report: PurgeReport = {
      expiredSessions: await this.sessions.purgeExpired(),
      staleLoginAttempts: await this.throttle.purgeOld(),
      expiredPairingCodes: await this.clearExpiredPairingCodes(),
      orphanedFiles: await this.deleteOrphanedFiles(),
    };

    this.logger.log(
      `Purged ${report.expiredSessions} session(s), ${report.staleLoginAttempts} login attempt(s), ${report.expiredPairingCodes} pairing code(s), ${report.orphanedFiles} orphaned file(s)`,
    );
    return report;
  }

  /// A pairing code that expired unused is still a credential. Clearing it
  /// leaves the device row alone — an admin can issue a fresh code.
  private async clearExpiredPairingCodes(): Promise<number> {
    const result = await this.prisma.kioskDevice.updateMany({
      where: {
        pairedAt: null,
        pairingCodeHash: { not: null },
        pairingExpiresAt: { lt: new Date() },
      },
      data: { pairingCodeHash: null, pairingExpiresAt: null },
    });
    return result.count;
  }

  /**
   * Bytes nothing points at any more.
   *
   * The database storage backend has no foreign key back to the documents that
   * reference it — on purpose, so it stays a storage backend — and deleting a
   * document removes the metadata row before the bytes. That order is right
   * (the other way round leaves a download that 404s) but it means a failure
   * between the two steps leaves bytes behind. This is the sweep for them.
   */
  private async deleteOrphanedFiles(): Promise<number> {
    const before = new Date(Date.now() - ORPHAN_GRACE_MINUTES * 60_000);

    const referenced = await this.prisma.checklistDocument.findMany({
      select: { storageKey: true },
    });
    const keys = referenced.map((document) => document.storageKey);

    const result = await this.prisma.storedFile.deleteMany({
      where: {
        createdAt: { lt: before },
        ...(keys.length > 0 ? { storageKey: { notIn: keys } } : {}),
      },
    });
    return result.count;
  }
}
