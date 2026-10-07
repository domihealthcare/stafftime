import { Injectable, Logger } from '@nestjs/common';
import {
  EmploymentStatus,
  EventAudience,
  NotificationKind,
  PracticeEventKind,
  Prisma,
  ShiftStatus,
} from '@prisma/client';
import {
  addDaysTo,
  localDateIn,
  localTimeIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { InboxService } from '../email/inbox.service';
import { PrismaService } from '../prisma/prisma.service';

/// From when, on the practice's clock, the evening notice goes out. The
/// five-minute timer runs until midnight, so anything from here on works.
export const LUNCH_NOTICE_FROM = '18:00';

/**
 * The night-before rep lunch notice (October 2026, Dominguez: "it should
 * notify all staff at that office the night before even if there is no rep
 * lunch, so staff knows to bring their own lunch").
 *
 * Every evening, for each office open tomorrow, everybody who works at that
 * office hears either "Rep lunch tomorrow" — who, when, catering or not — or
 * "No rep lunch tomorrow — bring your own lunch". On the bell.
 *
 * "Open tomorrow" is the rota's word: at least one published shift there that
 * is not from home, and the office not closed all day. So nobody is told to
 * pack a lunch for a Sunday, or for Christmas.
 *
 * Each office and day is claimed in `LunchNotice` before anybody is told, so
 * the timer can run every five minutes all evening and each goes once.
 */
@Injectable()
export class LunchNoticesService {
  private readonly logger = new Logger(LunchNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  /// Sends tonight's notices that have not gone yet. Returns how many offices
  /// were told.
  async send(now: Date = new Date()): Promise<number> {
    if (localTimeIn(now, PRACTICE_ZONE) < LUNCH_NOTICE_FROM) return 0;
    const tomorrow = addDaysTo(localDateIn(now, PRACTICE_ZONE), 1);
    const from = zonedTimeToUtc(tomorrow, '00:00', PRACTICE_ZONE);
    const to = zonedTimeToUtc(addDaysTo(tomorrow, 1), '00:00', PRACTICE_ZONE);
    const day = new Date(`${tomorrow}T00:00:00.000Z`);

    const offices = await this.prisma.location.findMany({
      where: { lunchNotices: { none: { day } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    let told = 0;
    for (const office of offices) {
      if (!(await this.openOn(office.id, from, to))) continue;
      if (!(await this.claim(office.id, day))) continue;

      const [lunches, staff] = await Promise.all([
        this.prisma.practiceEvent.findMany({
          where: {
            kind: PracticeEventKind.REP_LUNCH,
            atLocationId: office.id,
            startsAt: { gte: from, lt: to },
          },
          select: {
            startsAt: true,
            title: true,
            rep: { select: { name: true, company: true, food: true } },
          },
          orderBy: { startsAt: 'asc' },
        }),
        this.prisma.employee.findMany({
          where: {
            employmentStatus: { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] },
            locations: { some: { locationId: office.id } },
          },
          select: { id: true },
        }),
      ]);

      await this.inbox.notify(
        staff.map((person) => person.id),
        lunches.length > 0
          ? {
              kind: NotificationKind.EVENT,
              title: `Rep lunch tomorrow at ${office.name}`,
              body: lunches.map(lunchLine).join('\n'),
              link: `/schedule/calendar?month=${tomorrow.slice(0, 8)}01`,
            }
          : {
              kind: NotificationKind.EVENT,
              title: `No rep lunch tomorrow at ${office.name}`,
              body: 'Bring your own lunch.',
              link: `/schedule/calendar?month=${tomorrow.slice(0, 8)}01`,
            },
      );
      told += 1;
    }
    if (told > 0) this.logger.log(`Told ${told} office(s) about tomorrow's rep lunch`);
    return told;
  }

  /// Somebody is working at the office tomorrow, and it is not shut all day.
  private async openOn(locationId: string, from: Date, to: Date): Promise<boolean> {
    const [working, closed] = await Promise.all([
      this.prisma.shift.count({
        where: {
          locationId,
          isRemote: false,
          employeeId: { not: null },
          status: ShiftStatus.PUBLISHED,
          startsAt: { gte: from, lt: to },
        },
      }),
      this.prisma.practiceEvent.count({
        where: {
          kind: PracticeEventKind.CLOSURE,
          startsAt: { lte: from },
          endsAt: { gte: to },
          OR: [{ audience: EventAudience.EVERYONE }, { locationId }],
        },
      }),
    ]);
    return working > 0 && closed === 0;
  }

  /// Takes this office and day for this run; false if another run has it.
  private async claim(locationId: string, day: Date): Promise<boolean> {
    try {
      await this.prisma.lunchNotice.create({ data: { locationId, day } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }
}

/// "12:30 PM — Jane Smith (Novo Nordisk), bringing catering".
function lunchLine(lunch: {
  startsAt: Date;
  title: string;
  rep: { name: string; company: string | null; food: string | null } | null;
}): string {
  const time = lunch.startsAt.toLocaleTimeString('en-US', {
    timeZone: PRACTICE_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
  const who = lunch.rep
    ? `${lunch.rep.name}${lunch.rep.company ? ` (${lunch.rep.company})` : ''}`
    : lunch.title.replace(/^Rep lunch: /, '');
  const food =
    lunch.rep?.food === 'CATERING'
      ? ', bringing catering'
      : lunch.rep?.food === 'SELF_ORDER'
        ? ', the office orders'
        : '';
  return `${time} — ${who}${food}`;
}
