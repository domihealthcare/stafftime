import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, PtoStatus, ShiftStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { buildCalendar, type CalendarEvent } from './ical';

/// How much history and future to publish. Enough to be useful, bounded so the
/// feed stays small and fast for a calendar app polling it hourly.
const WINDOW_BEHIND_DAYS = 60;
const WINDOW_AHEAD_DAYS = 365;

const TOKEN_BYTES = 24;

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// The employee's existing token, or null if they have never asked for one.
  async currentToken(employeeId: string): Promise<{ token: string | null; setAt: Date | null }> {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { calendarToken: true, calendarTokenSetAt: true },
    });
    return { token: employee.calendarToken, setAt: employee.calendarTokenSetAt };
  }

  /**
   * Creates a token, or replaces the existing one.
   *
   * Replacing is how someone un-shares a link they pasted somewhere they should
   * not have — the old URL stops working immediately.
   */
  async issueToken(employeeId: string): Promise<{ token: string }> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { calendarToken: token, calendarTokenSetAt: new Date() },
    });
    this.logger.log(`Calendar link issued for employee ${employeeId}`);
    return { token };
  }

  async revokeToken(employeeId: string): Promise<void> {
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { calendarToken: null, calendarTokenSetAt: null },
    });
    this.logger.log(`Calendar link revoked for employee ${employeeId}`);
  }

  /**
   * Builds the feed for a token.
   *
   * The token *is* the credential — calendar apps cannot send an auth header —
   * so it is long, random, per-employee, and revocable, and the feed exposes
   * only that one person's schedule.
   */
  async feedForToken(token: string, now = new Date()): Promise<string> {
    const employee = await this.prisma.employee.findUnique({
      where: { calendarToken: token },
      select: {
        id: true,
        firstName: true,
        preferredName: true,
        lastName: true,
        employmentStatus: true,
      },
    });

    // A former employee's link stops working, like their sign-in.
    if (!employee || employee.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new NotFoundException();
    }

    const from = new Date(now.getTime() - WINDOW_BEHIND_DAYS * 86_400_000);
    const to = new Date(now.getTime() + WINDOW_AHEAD_DAYS * 86_400_000);

    const [shifts, timeOff] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          employeeId: employee.id,
          // Drafts are a manager's working copy; publishing them would put
          // provisional shifts on somebody's personal calendar.
          status: ShiftStatus.PUBLISHED,
          startsAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          notes: true,
          updatedAt: true,
          location: {
            select: { name: true, addressLine1: true, city: true, state: true },
          },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.ptoRequest.findMany({
        where: {
          employeeId: employee.id,
          status: PtoStatus.APPROVED,
          startDate: { lte: to },
          endDate: { gte: from },
        },
        select: {
          id: true,
          type: true,
          startDate: true,
          endDate: true,
          isHalfDay: true,
          updatedAt: true,
        },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    const displayName = employee.preferredName ?? employee.firstName;

    const events: CalendarEvent[] = [
      ...shifts.map((shift) => ({
        // Namespaced and stable, so an edited shift updates in place.
        uid: `shift-${shift.id}@staff.domihealthcare.com`,
        sequence: secondsSinceEpoch(shift.updatedAt),
        summary: `Work — ${shift.location.name}`,
        description: shift.notes ?? undefined,
        location: [
          shift.location.addressLine1,
          shift.location.city,
          shift.location.state,
        ]
          .filter(Boolean)
          .join(', '),
        start: shift.startsAt,
        end: shift.endsAt,
      })),
      ...timeOff.map((request) => ({
        uid: `pto-${request.id}@staff.domihealthcare.com`,
        sequence: secondsSinceEpoch(request.updatedAt),
        summary: `${titleCase(request.type)}${request.isHalfDay ? ' (half day)' : ''}`,
        startDate: request.startDate,
        endDate: request.endDate,
        // Time off should not make the person look busy to a scheduler.
        transparent: true,
      })),
    ];

    return buildCalendar(events, {
      name: `${displayName} ${employee.lastName} — Domi Staff`,
      description: 'Shifts and approved time off from Domi Staff.',
      refreshMinutes: 60,
      now,
    });
  }
}

/// iCalendar SEQUENCE must be a non-negative integer that only increases.
function secondsSinceEpoch(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
