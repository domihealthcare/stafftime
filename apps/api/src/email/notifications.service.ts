import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmploymentStatus, PtoStatus, PtoType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
    const text = [...body, '', '—', 'Domi Time & Scheduling', this.appUrl].join('\n');

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
    return this.config.get<string>('APP_ENVIRONMENT') === 'test'
      ? `[Test] ${subject}`
      : subject;
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

  /// The reset link itself. Sent to an address that may not belong to anyone —
  /// the caller decides that, and never says either way.
  passwordReset(to: string, firstName: string, link: string, validMinutes: number): void {
    this.dispatch(to, 'Reset your Domi password', [
      `Hello ${firstName},`,
      '',
      'Somebody asked to reset the password on your Domi Time & Scheduling account.',
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
