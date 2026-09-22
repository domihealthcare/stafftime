import { Injectable, Logger } from '@nestjs/common';
import { LoginThrottleService } from '../auth/login-throttle.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { DigestService } from '../email/digest.service';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  LOCATION_RETENTION_DAYS,
  locationRetentionCutoff,
} from '../time-entries/location-retention';

/// An unreferenced file younger than this is left alone: it may belong to an
/// export that is still in flight, between the storage write and the record
/// landing.
const ORPHAN_GRACE_MINUTES = 60;

export interface PurgeReport {
  expiredSessions: number;
  staleLoginAttempts: number;
  spentResetTokens: number;
  expiredPairingCodes: number;
  orphanedFiles: number;
  /// Punches whose captured coordinates and IP were cleared for age.
  clearedLocations: number;
  /// How many managers were told about something that needs a look. Zero when
  /// there was nothing to say, which is most days.
  digestSentTo: number;
}

/**
 * Housekeeping that nothing else has a reason to do.
 *
 * None of this is urgent, and none of it can be left forever: expired sessions
 * accumulate a row per sign-in, the throttle table grows with every wrong
 * password, and a pairing code or reset link that was never used is a live
 * credential sitting in the database.
 *
 * It also sends the daily digest, because this is already the one thing that
 * runs every night whether anybody is looking or not.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
    private readonly resets: PasswordResetService,
    private readonly digest: DigestService,
  ) {}

  async purge(): Promise<PurgeReport> {
    const report: PurgeReport = {
      expiredSessions: await this.sessions.purgeExpired(),
      staleLoginAttempts: await this.throttle.purgeOld(),
      spentResetTokens: await this.resets.purgeExpired(),
      expiredPairingCodes: await this.clearExpiredPairingCodes(),
      orphanedFiles: await this.deleteOrphanedFiles(),
      clearedLocations: await this.clearOldPunchLocations(),
      digestSentTo: await this.sendDigest(),
    };

    this.logger.log(
      `Purged ${report.expiredSessions} session(s), ${report.staleLoginAttempts} login attempt(s), ${report.spentResetTokens} reset token(s), ${report.expiredPairingCodes} pairing code(s), ${report.orphanedFiles} orphaned file(s), ${report.clearedLocations} punch location(s)`,
    );
    return report;
  }

  /**
   * The nightly round-up of what nobody has got to yet.
   *
   * Never allowed to fail the job. Tidying up and telling people are separate
   * concerns, and a mail provider having a bad night must not stop expired
   * sessions being cleared.
   */
  private async sendDigest(): Promise<number> {
    try {
      const { sent } = await this.digest.send();
      return sent;
    } catch (error) {
      this.logger.error(
        `Could not send the daily digest: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }

  /**
   * Clears the coordinates and IP off punches older than the retention window.
   *
   * The punch itself is untouched — the time, the location it was attributed
   * to, and what the geofence check concluded all stay. What goes is the raw
   * position: a record of where each member of staff physically was on each
   * morning, which stops being useful long before it stops being sensitive.
   *
   * See `time-entries/location-retention.ts` for why ninety days.
   *
   * Only rows that still hold something are touched, so a quiet night is a
   * no-op rather than a full-table write.
   */
  private async clearOldPunchLocations(): Promise<number> {
    const cutoff = locationRetentionCutoff();

    const result = await this.prisma.timeEntry.updateMany({
      where: {
        clockInAt: { lt: cutoff },
        OR: [
          { clockInLatitude: { not: null } },
          { clockInIp: { not: null } },
          { clockOutLatitude: { not: null } },
          { clockOutIp: { not: null } },
        ],
      },
      data: {
        clockInLatitude: null,
        clockInLongitude: null,
        clockInAccuracyMeters: null,
        clockInIp: null,
        clockOutLatitude: null,
        clockOutLongitude: null,
        clockOutAccuracyMeters: null,
        clockOutIp: null,
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Cleared captured location from ${result.count} punch(es) older than ${LOCATION_RETENTION_DAYS} days`,
      );
    }
    return result.count;
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
   * Payroll export files are the only thing this app stores bytes for. The
   * storage backend has no foreign key back to the records that reference it —
   * on purpose, so it stays a storage backend — and voiding an export clears
   * the metadata's pointer before the bytes go. That order is right (the other
   * way round leaves a download that 404s) but a failure between the two steps
   * leaves bytes behind. This is the sweep for them.
   *
   * The list of keys to keep must cover every kind of record that stores bytes.
   * Miss one and this quietly deletes live files an hour after they are written.
   */
  private async deleteOrphanedFiles(): Promise<number> {
    const before = new Date(Date.now() - ORPHAN_GRACE_MINUTES * 60_000);

    const referenced = await this.prisma.payrollExport.findMany({
      where: { storageKey: { not: null } },
      select: { storageKey: true },
    });
    const keys = referenced.map((row) => row.storageKey!);

    const result = await this.prisma.storedFile.deleteMany({
      where: {
        createdAt: { lt: before },
        ...(keys.length > 0 ? { storageKey: { notIn: keys } } : {}),
      },
    });
    return result.count;
  }
}
