import { Injectable } from '@nestjs/common';
import { CallOutcome, EmploymentStatus, NotificationKind, Prisma, Role } from '@prisma/client';
import { named, PERSON } from '../on-call/on-call.service';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { phoneWords } from '../common/util/phone';
import { PRACTICE_ZONE } from '../common/util/zoned-time.util';

export type CallRole = 'ON_CALL' | 'BACKUP' | 'FINAL' | 'DEFAULT' | 'FALLBACK';

/// One try, as kept in CallLog.attempts and shown on the call log screen.
export interface CallAttemptRecord {
  step: number;
  role: CallRole;
  employeeId: string | null;
  name: string;
  result: string | null;
  at: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/// Why a missed-call alert goes out, for its words.
export type MissedReason = 'NOT_REACHED' | 'HUNG_UP' | 'NOBODY_TO_RING';

/// "9:14 PM" on New Jersey's clock.
function clockTime(at: Date): string {
  return at.toLocaleTimeString('en-US', {
    timeZone: PRACTICE_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The after-hours call log: who called (number in full, providers call back),
 * who was tried and who took it. No audio, nothing said. Deleted after 90 days.
 */
@Injectable()
export class CallLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async start(callSid: string, callerNumber: string | null): Promise<void> {
    await this.prisma.callLog.upsert({
      where: { callSid },
      create: { callSid, callerNumber },
      update: {},
    });
  }

  // Every write after `start` only changes a call already in the log, so a
  // replayed request for a call long gone cannot bring it back.

  async setLanguage(callSid: string, language: 'en' | 'es', usedFallback: boolean): Promise<void> {
    await this.prisma.callLog.updateMany({
      where: { callSid },
      data: { language, usedFallback },
    });
  }

  /// A step about to ring, its result still to come.
  async beginAttempt(callSid: string, attempt: CallAttemptRecord): Promise<void> {
    await this.changeAttempts(callSid, (attempts) => [...attempts, attempt]);
  }

  /// A step's result: fills in the try begun for that step, or adds it.
  async endAttempt(callSid: string, attempt: CallAttemptRecord): Promise<void> {
    await this.changeAttempts(callSid, (attempts) => {
      const at = attempts
        .map((a) => a.step === attempt.step && a.result === null)
        .lastIndexOf(true);
      if (at === -1) return [...attempts, attempt];
      const next = [...attempts];
      next[at] = { ...next[at], result: attempt.result };
      return next;
    });
  }

  /// Kept for older callers: adds a finished try.
  async addAttempt(callSid: string, attempt: CallAttemptRecord): Promise<void> {
    await this.beginAttempt(callSid, attempt);
  }

  private async changeAttempts(
    callSid: string,
    change: (attempts: CallAttemptRecord[]) => CallAttemptRecord[],
  ): Promise<void> {
    const row = await this.prisma.callLog.findUnique({
      where: { callSid },
      select: { attempts: true },
    });
    if (!row) return;
    const attempts = (Array.isArray(row.attempts)
      ? row.attempts
      : []) as unknown as CallAttemptRecord[];
    await this.prisma.callLog.updateMany({
      where: { callSid },
      data: { attempts: change(attempts) as unknown as Prisma.InputJsonValue },
    });
  }

  /// The provider pressed 1 on the whisper. The outcome is set when the dial ends.
  async recordAcceptance(callSid: string, employeeId: string | null): Promise<void> {
    if (!employeeId) return;
    await this.prisma.callLog.updateMany({
      where: { callSid },
      data: { acceptedById: employeeId },
    });
  }

  async finish(
    callSid: string,
    outcome: CallOutcome,
    extra: { acceptedById?: string | null } = {},
  ): Promise<void> {
    await this.prisma.callLog.updateMany({
      where: { callSid },
      data: {
        outcome,
        endedAt: new Date(),
        ...(extra.acceptedById ? { acceptedById: extra.acceptedById } : {}),
      },
    });
  }

  /// The call ended while still in progress. A provider who pressed 1 took it
  /// (the dial's own answer may never come when the caller hangs up first);
  /// otherwise the caller hung up. Returns whether a provider's phone had
  /// been rung, for the alert.
  async markCallerHungUp(callSid: string): Promise<{ updated: boolean; tried: boolean }> {
    const now = new Date();
    await this.prisma.callLog.updateMany({
      where: { callSid, outcome: CallOutcome.IN_PROGRESS, acceptedById: { not: null } },
      data: { outcome: CallOutcome.ACCEPTED, endedAt: now },
    });
    const result = await this.prisma.callLog.updateMany({
      where: { callSid, outcome: CallOutcome.IN_PROGRESS, acceptedById: null },
      data: { outcome: CallOutcome.CALLER_HUNG_UP, endedAt: now },
    });
    if (result.count === 0) return { updated: false, tried: false };
    const row = await this.prisma.callLog.findUnique({
      where: { callSid },
      select: { attempts: true },
    });
    return { updated: true, tried: Array.isArray(row?.attempts) && row.attempts.length > 0 };
  }

  /// Bell, email and phone, once per call: to the on-call and backup who were
  /// rung, else whoever was rung, else the default provider, else the
  /// admins, so somebody always knows.
  async sendMissedCallAlert(
    callSid: string,
    reason: MissedReason = 'NOT_REACHED',
  ): Promise<boolean> {
    const claim = await this.prisma.callLog.updateMany({
      where: { callSid, alertSentAt: null },
      data: { alertSentAt: new Date() },
    });
    if (claim.count !== 1) return false;
    const row = await this.prisma.callLog.findUnique({
      where: { callSid },
      select: { attempts: true, callerNumber: true, startedAt: true },
    });
    if (!row) return false;
    const attempts = (Array.isArray(row.attempts)
      ? row.attempts
      : []) as unknown as CallAttemptRecord[];
    const ids = await this.alertRecipients(attempts);
    if (ids.length === 0) return false;
    const who = row.callerNumber ? phoneWords(row.callerNumber) : 'a withheld number';
    const when = clockTime(row.startedAt);
    const body =
      reason === 'HUNG_UP'
        ? `After-hours call from ${who} at ${when} ended before anybody pressed 1. If they left no voicemail, please call back.`
        : reason === 'NOBODY_TO_RING'
          ? `After-hours call from ${who} at ${when}: nobody on call could be rung. Please call back, and check the on-call schedule and phones.`
          : `Missed after-hours call from ${who} at ${when}. Nobody could take it. Please call back.`;
    await this.notifications.personal(ids, NotificationKind.ON_CALL, {
      title: 'Missed after-hours call',
      body,
      link: '/on-call/calls',
    });
    return true;
  }

  private async alertRecipients(attempts: CallAttemptRecord[]): Promise<string[]> {
    const rung = attempts.filter((a) => a.employeeId);
    const main = rung.filter(
      (a) => a.role === 'ON_CALL' || a.role === 'BACKUP' || a.role === 'FINAL',
    );
    const chosen = main.length > 0 ? main : rung;
    const ids = [...new Set(chosen.map((a) => a.employeeId as string))];
    if (ids.length > 0) return ids;
    const settings = await this.prisma.callRoutingSettings.findUnique({
      where: { id: 1 },
      select: { defaultProviderId: true },
    });
    if (settings?.defaultProviderId) return [settings.defaultProviderId];
    const admins = await this.prisma.employee.findMany({
      where: {
        role: Role.ADMIN,
        employmentStatus: EmploymentStatus.ACTIVE,
        isSharedAccount: false,
      },
      select: { id: true },
    });
    return admins.map((admin) => admin.id);
  }

  /// The last 30 days, newest first, as the call log screen reads them.
  async list(now: Date = new Date()) {
    const rows = await this.prisma.callLog.findMany({
      where: { startedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      orderBy: { startedAt: 'desc' },
      include: { acceptedBy: { select: PERSON } },
    });
    return rows.map((row) => ({
      id: row.id,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt ? row.endedAt.toISOString() : null,
      language: row.language === 'en' || row.language === 'es' ? row.language : null,
      callerNumber: row.callerNumber,
      outcome: row.outcome,
      usedFallback: row.usedFallback,
      acceptedBy: row.acceptedBy
        ? { id: row.acceptedBy.id, name: named(row.acceptedBy).name }
        : null,
      attempts: (Array.isArray(row.attempts) ? row.attempts : []) as unknown as CallAttemptRecord[],
      alertSentAt: row.alertSentAt ? row.alertSentAt.toISOString() : null,
    }));
  }

  /// For the nightly job.
  async purgeOlderThan(days = 90, now: Date = new Date()): Promise<number> {
    const result = await this.prisma.callLog.deleteMany({
      where: { startedAt: { lt: new Date(now.getTime() - days * DAY_MS) } },
    });
    return result.count;
  }
}
