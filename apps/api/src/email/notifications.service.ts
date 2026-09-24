import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmploymentStatus, PtoStatus, PtoType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DigestContents } from './digest.service';
import { EMAIL_SENDER, EmailSender } from './email-sender';

/**
 * The messages this app actually sends, and who gets them.
 *
 * Every method here is **fire and forget**. Nothing in the app waits for an
 * email, and nothing fails because one did not send: a time-off approval that
 * errored because a mail server hiccuped would be a far worse bug than a
 * missing notification.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  /// Fire and forget. Never awaited by a request handler.
  private dispatch(to: string, subject: string, body: string[]): void {
    const text = [...body, '', '—', 'Domi Staff', this.appUrl].join('\n');

    void this.email
      .send({ to, subject: this.prefixed(subject), text })
      .catch((error: unknown) =>
        this.logger.error(
          `Notification to ${to} failed: ${error instanceof Error ? error.message : error}`,
        ),
      );
  }

  /// A test deployment's mail must be obviously not real, in the subject line,
  /// where somebody sees it before opening anything.
  private prefixed(subject: string): string {
    return this.config.get<string>('APP_ENVIRONMENT') === 'test' ? `[Test] ${subject}` : subject;
  }

  /// "Your time off was approved" / "…was not approved".
  async ptoDecided(requestId: string): Promise<void> {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: { select: { email: true, firstName: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!request) return;

    const approved = request.status === PtoStatus.APPROVED;
    const decider = request.reviewedBy
      ? `${request.reviewedBy.firstName} ${request.reviewedBy.lastName}`
      : 'A manager';

    this.dispatch(
      request.employee.email,
      approved ? 'Your time off is approved' : 'Your time off request was not approved',
      [
        `Hello ${request.employee.firstName},`,
        '',
        `${decider} ${approved ? 'approved' : 'did not approve'} your ${describeType(request.type)} request for ${describeRange(request.startDate, request.endDate, request.isHalfDay)}.`,
        ...(request.reviewNote ? ['', `They said: “${request.reviewNote}”`] : []),
        ...(approved
          ? [
              '',
              'Any shifts already on the schedule for those days are still there — a manager will sort the cover out.',
            ]
          : ['', 'Talk to your manager if you need to sort something out.']),
      ],
    );
  }

  /// Managers are not told anything today unless they go and look, which is how
  /// a request sits for a week.
  async ptoRequested(requestId: string): Promise<void> {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!request) return;

    const deciders = await this.prisma.employee.findMany({
      where: {
        role: { in: [Role.MANAGER, Role.ADMIN] },
        employmentStatus: EmploymentStatus.ACTIVE,
        // Nobody needs an email about their own request.
        id: { not: request.employeeId },
      },
      select: { email: true, firstName: true },
    });

    const who = `${request.employee.firstName} ${request.employee.lastName}`;
    for (const decider of deciders) {
      this.dispatch(decider.email, `${who} has asked for time off`, [
        `Hello ${decider.firstName},`,
        '',
        `${who} has asked for ${describeType(request.type)} for ${describeRange(request.startDate, request.endDate, request.isHalfDay)}.`,
        ...(request.notes ? ['', `They said: “${request.notes}”`] : []),
        '',
        `Approve or deny it here: ${this.appUrl}/time-off`,
      ]);
    }
  }

  /// "Your rota puts you into overtime". Sent once, when a published change
  /// first takes somebody's week over the line — so they hear it from the app
  /// before they hear it from their payslip, and can say so if it is a mistake.
  async scheduledIntoOvertime(
    employeeId: string,
    weekStart: string,
    scheduledHours: number,
    thresholdHours: number,
  ): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { email: true, firstName: true, preferredName: true, employmentStatus: true },
    });
    if (!employee || employee.employmentStatus === EmploymentStatus.TERMINATED) return;

    const week = new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    const over = Math.round((scheduledHours - thresholdHours) * 100) / 100;

    this.dispatch(employee.email, 'Your schedule puts you into overtime', [
      `Hello ${employee.preferredName ?? employee.firstName},`,
      '',
      `You are now scheduled for ${scheduledHours} hours in the week starting ${week}. That is ${over} ${over === 1 ? 'hour' : 'hours'} past the ${thresholdHours}-hour overtime line.`,
      '',
      'If that is not what you agreed, talk to your manager before the week starts.',
      '',
      `Your schedule: ${this.appUrl}/schedule`,
    ]);
  }

  /**
   * The nightly round-up of what nobody has got to yet.
   *
   * Sections with nothing in them are left out entirely rather than printed
   * empty. An email that is mostly "nothing to report" teaches people to skim
   * past it, and then they skim past the one that matters.
   */
  dailyDigest(to: string, firstName: string, contents: DigestContents): void {
    const section = (heading: string, lines: string[]) =>
      lines.length === 0 ? [] : ['', heading, ...lines.map((line) => `  · ${line}`)];

    this.dispatch(to, 'What needs a look today', [
      `Hello ${firstName},`,
      // Roughly in the order somebody would act: the things that are broken
      // right now, then the things with a deadline, then the paperwork.
      ...section('Kiosk tablets that have gone quiet:', contents.silentKiosks),
      ...section('Next week is not published yet:', contents.unpublishedRota),
      ...section('Shifts for people who have left:', contents.shiftsForLeavers),
      ...section('Open shifts nobody is on yet:', contents.openShifts),
      ...section('Credentials that have already lapsed:', contents.expiredCredentials),
      ...section('Credentials expiring soon:', contents.expiringCredentials),
      ...section('Hours not approved yet:', contents.unapprovedHours),
      ...section('Checklist tasks past their due date:', contents.overdueTasks),
      ...section('Punches with no clock-out:', contents.missingPunches),
      ...section('Time off waiting on a decision:', contents.undecidedTimeOff),
      '',
      `Everything here is in the app: ${this.appUrl}`,
    ]);
  }

  /// The reset link itself. Sent to an address that may not belong to anyone —
  /// the caller decides that, and never says either way.
  passwordReset(to: string, firstName: string, link: string, validMinutes: number): void {
    this.dispatch(to, 'Reset your Domi password', [
      `Hello ${firstName},`,
      '',
      'Somebody asked to reset the password on your Domi Staff account.',
      '',
      link,
      '',
      `That link works once and stops working in ${validMinutes} minutes.`,
      '',
      'If this was not you, you can ignore this — your password has not changed. Tell an administrator if it keeps happening.',
    ]);
  }
}

function describeType(type: PtoType): string {
  const labels: Record<PtoType, string> = {
    VACATION: 'time off',
    SICK: 'sick leave',
    PERSONAL: 'a personal day',
    BEREAVEMENT: 'bereavement leave',
    UNPAID: 'unpaid leave',
    OTHER: 'time off',
  };
  return labels[type];
}

function describeRange(start: Date, end: Date, isHalfDay: boolean): string {
  const format = (date: Date) =>
    date.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  if (start.getTime() === end.getTime()) {
    return isHalfDay ? `${format(start)} (half day)` : format(start);
  }
  return `${format(start)} to ${format(end)}`;
}
