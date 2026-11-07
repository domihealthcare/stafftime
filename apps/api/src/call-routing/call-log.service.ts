import { Injectable } from '@nestjs/common';
import { CallOutcome, NotificationKind, Prisma } from '@prisma/client';
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

  async setLanguage(callSid: string, language: 'en' | 'es', usedFallback: boolean): Promise<void> {
    await this.prisma.callLog.upsert({
      where: { callSid },
      create: { callSid, language, usedFallback },
      update: { language, usedFallback },
    });
  }

  async addAttempt(callSid: string, attempt: CallAttemptRecord): Promise<void> {
    const row = await this.prisma.callLog.findUnique({
      where: { callSid },
      select: { attempts: true },
    });
    const attempts = [...(Array.isArray(row?.attempts) ? row.attempts : []), attempt];
    await this.prisma.callLog.upsert({
      where: { callSid },
      create: { callSid, attempts: attempts as unknown as Prisma.InputJsonValue },
      update: { attempts: attempts as unknown as Prisma.InputJsonValue },
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
    const data = {
      outcome,
      endedAt: new Date(),
      ...(extra.acceptedById ? { acceptedById: extra.acceptedById } : {}),
    };
    await this.prisma.callLog.upsert({
      where: { callSid },
      create: { callSid, ...data },
      update: data,
    });
  }

  /// The caller hung up before anything ended the call. Not for a call a
  /// provider already accepted. Returns whether a provider had been tried.
  async markCallerHungUp(callSid: string): Promise<{ updated: boolean; tried: boolean }> {
    const result = await this.prisma.callLog.updateMany({
      where: { callSid, outcome: CallOutcome.IN_PROGRESS, acceptedById: null },
      data: { outcome: CallOutcome.CALLER_HUNG_UP, endedAt: new Date() },
    });
    if (result.count === 0) return { updated: false, tried: false };
    const row = await this.prisma.callLog.findUnique({
      where: { callSid },
      select: { attempts: true },
    });
    return { updated: true, tried: Array.isArray(row?.attempts) && row.attempts.length > 0 };
  }

  /// Bell, email and phone to the on-call and backup providers, once per call.
  async sendMissedCallAlert(callSid: string): Promise<boolean> {
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
    const wanted = attempts.filter(
      (a) => a.employeeId && (a.role === 'ON_CALL' || a.role === 'BACKUP'),
    );
    const chosen = wanted.length > 0 ? wanted : attempts.filter((a) => a.employeeId);
    const ids = [...new Set(chosen.map((a) => a.employeeId as string))];
    if (ids.length === 0) return false;
    const who = row.callerNumber ? phoneWords(row.callerNumber) : 'a withheld number';
    await this.notifications.personal(ids, NotificationKind.ON_CALL, {
      title: 'Missed after-hours call',
      body: `Missed after-hours call from ${who} at ${clockTime(row.startedAt)}. Nobody could take it. Please call back.`,
      link: '/on-call/calls',
    });
    return true;
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
