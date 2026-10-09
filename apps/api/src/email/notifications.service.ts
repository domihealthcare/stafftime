import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DigestTopic,
  EmploymentStatus,
  NotificationKind,
  PtoStatus,
  PtoType,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PRACTICE_ZONE } from '../common/util/zoned-time.util';
import type { DigestContents } from './digest.service';
import { digestEmail } from './digest-email';
import { readersOf } from './digest-topics';
import { EMAIL_SENDER, EmailResult, EmailSender } from './email-sender';
import { InboxService } from './inbox.service';
import { type WelcomeDetails, welcomeEmail } from './welcome-email';

/**
 * The messages this app actually sends, and who gets them.
 *
 * Every method here is awaited by its caller and **never throws**. Awaited,
 * because the app runs as a serverless function: work left running after the
 * response is sent can be frozen and never finish, which is how reset emails
 * silently failed to leave on Vercel. Never throws, because nothing should fail
 * because an email did not send: a time-off approval that errored because a
 * mail server hiccuped would be a far worse bug than a missing notification.
 * The provider call has its own deadline, so waiting is bounded.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly inbox: InboxService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  /// Sends and waits; failures are logged, never thrown.
  private async dispatch(to: string, subject: string, body: string[]): Promise<void> {
    const text = [...body, '', '—', 'Domi Staff', this.appUrl].join('\n');

    try {
      await this.email.send({ to, subject: this.prefixed(subject), text });
    } catch (error: unknown) {
      this.logger.error(
        `Notification to ${to} failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /// A test deployment's mail must be obviously not real, in the subject line,
  /// where somebody sees it before opening anything.
  private prefixed(subject: string): string {
    return this.config.get<string>('APP_ENVIRONMENT') === 'test' ? `[Test] ${subject}` : subject;
  }

  /// "Your time off was approved" / "…was not approved".
  async ptoDecided(requestId: string, shiftsTakenOff = 0): Promise<void> {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: { select: { id: true, email: true, firstName: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!request) return;

    const approved = request.status === PtoStatus.APPROVED;
    const decider = request.reviewedBy
      ? `${request.reviewedBy.firstName} ${request.reviewedBy.lastName}`
      : 'A manager';

    await this.inbox.notify([request.employee.id], {
      kind: NotificationKind.TIME_OFF_DECIDED,
      title: approved ? 'Your time off is approved' : 'Your time off request was not approved',
      body: `${capitalise(describeType(request.type))}, ${describeRange(request.startDate, request.endDate, request.isHalfDay)} — ${decider}${request.reviewNote ? `: “${request.reviewNote}”` : ''}${
        shiftsTakenOff > 0
          ? `. ${shiftsTakenOff === 1 ? 'Your shift on those days is' : `Your ${shiftsTakenOff} shifts on those days are`} off your schedule.`
          : ''
      }`,
      link: '/time-off',
    });

    await this.dispatch(
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
              shiftsTakenOff > 0
                ? `${shiftsTakenOff === 1 ? 'Your shift on those days has' : `Your ${shiftsTakenOff} shifts on those days have`} been taken off your schedule.`
                : 'Any shifts already on the schedule for those days are still there — a manager will sort the cover out.',
            ]
          : ['', 'Talk to your manager if you need to sort something out.']),
      ],
    );
  }

  /// Somebody's new availability clashes with one of their regular shifts
  /// (see `availability/regular-shift-clashes.ts`). On the bell of the
  /// managers down for the rota in the round-up (Email settings), or all of
  /// them when nobody is; the nightly email lists it too, so no email here.
  async availabilityClash(employeeId: string, lines: string[]): Promise<void> {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, preferredName: true, lastName: true },
    });
    if (!person || lines.length === 0) return;

    const managers = await this.prisma.employee.findMany({
      where: {
        role: { in: [Role.MANAGER, Role.ADMIN] },
        employmentStatus: EmploymentStatus.ACTIVE,
        id: { not: employeeId },
      },
      select: { id: true, mutedDigestTopics: true },
    });
    const who = `${person.preferredName ?? person.firstName} ${person.lastName}`;
    await this.inbox.notify(
      readersOf(DigestTopic.SCHEDULE, managers).map((manager) => manager.id),
      {
        kind: NotificationKind.AVAILABILITY_CLASH,
        title: `${who}'s new availability clashes with a regular shift`,
        body: lines.join('; '),
        link: '/schedule',
      },
    );
  }

  /// Managers are not told anything today unless they go and look, which is how
  /// a request sits for a week.
  ///
  /// Told to the managers down for time off in the round-up (Email settings),
  /// or to all of them when nobody is.
  async ptoRequested(requestId: string): Promise<void> {
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!request) return;

    const managers = await this.prisma.employee.findMany({
      where: {
        role: { in: [Role.MANAGER, Role.ADMIN] },
        employmentStatus: EmploymentStatus.ACTIVE,
        // Nobody needs an email about their own request.
        id: { not: request.employeeId },
      },
      select: { id: true, email: true, firstName: true, mutedDigestTopics: true },
    });
    const deciders = readersOf(DigestTopic.TIME_OFF, managers);

    const who = `${request.employee.firstName} ${request.employee.lastName}`;
    await this.inbox.notify(
      deciders.map((decider) => decider.id),
      {
        kind: NotificationKind.TIME_OFF_REQUESTED,
        title: `${who} has asked for time off`,
        body: `${capitalise(describeType(request.type))}, ${describeRange(request.startDate, request.endDate, request.isHalfDay)}`,
        link: '/time-off',
      },
    );
    for (const decider of deciders) {
      await this.dispatch(decider.email, `${who} has asked for time off`, [
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

    await this.inbox.notify([employeeId], {
      kind: NotificationKind.OVERTIME,
      title: 'Your schedule puts you into overtime',
      body: `${scheduledHours} hours in the week starting ${week} — ${over} past the ${thresholdHours}-hour line.`,
      link: '/schedule',
    });

    await this.dispatch(employee.email, 'Your schedule puts you into overtime', [
      `Hello ${employee.preferredName ?? employee.firstName},`,
      '',
      `You are now scheduled for ${scheduledHours} hours in the week starting ${week}. That is ${over} ${over === 1 ? 'hour' : 'hours'} past the ${thresholdHours}-hour overtime line.`,
      '',
      'If that is not what you agreed, talk to your manager before the week starts.',
      '',
      `Your schedule: ${this.appUrl}/schedule`,
    ]);
  }

  /// "You haven't clocked in yet" — 15 minutes into a published shift with no
  /// punch (see `maintenance/punch-reminders.service.ts`).
  async missedClockIn(
    employeeId: string,
    shift: { startsAt: Date; isRemote: boolean; locationName: string },
  ): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { email: true, firstName: true, preferredName: true },
    });
    if (!employee) return;

    const which = shift.isRemote
      ? 'Your work-from-home shift'
      : `Your shift at ${shift.locationName}`;
    const started = `${which} started at ${clockTime(shift.startsAt)}`;

    await this.inbox.notify([employeeId], {
      kind: NotificationKind.PUNCH_REMINDER,
      title: "You haven't clocked in yet",
      body: `${started}.`,
      link: '/',
    });

    await this.dispatch(employee.email, "You haven't clocked in yet", [
      `Hello ${employee.preferredName ?? employee.firstName},`,
      '',
      `${started} and you have not clocked in.`,
      '',
      `If you are working, clock in now: ${this.appUrl}`,
      '',
      'If you are not working today, or the app would not let you clock in, tell your manager.',
    ]);
  }

  /// "You're still clocked in" — 15 minutes after their shift ended.
  async missedClockOut(
    employeeId: string,
    shift: { endsAt: Date; isRemote: boolean; locationName: string },
  ): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { email: true, firstName: true, preferredName: true },
    });
    if (!employee) return;

    const which = shift.isRemote
      ? 'Your work-from-home shift'
      : `Your shift at ${shift.locationName}`;
    const ended = `${which} ended at ${clockTime(shift.endsAt)}`;

    await this.inbox.notify([employeeId], {
      kind: NotificationKind.PUNCH_REMINDER,
      title: "You're still clocked in",
      body: `${ended}.`,
      link: '/',
    });

    await this.dispatch(employee.email, "You're still clocked in", [
      `Hello ${employee.preferredName ?? employee.firstName},`,
      '',
      `${ended} and you are still clocked in.`,
      '',
      `If you have finished for the day, clock out now: ${this.appUrl}`,
      '',
      'If you left earlier, clock out anyway and tell your manager what time you left, so they can correct it.',
      '',
      'If you are still working, you can ignore this.',
    ]);
  }

  /// "Your DEA expires in 30 days" — to the person whose license it is (see
  /// `credentials/license-reminders.ts`). Managers already hear it in the
  /// nightly round-up; this is so the holder can renew before being chased.
  async licenseReminder(employeeId: string, words: { title: string; body: string }): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { email: true, firstName: true, preferredName: true },
    });
    if (!employee) return;

    await this.inbox.notify([employeeId], {
      kind: NotificationKind.LICENSE_REMINDER,
      title: words.title,
      body: words.body,
      link: '/credentials',
    });

    await this.dispatch(employee.email, words.title, [
      `Hello ${employee.preferredName ?? employee.firstName},`,
      '',
      words.body,
      '',
      `Your licenses and their dates: ${this.appUrl}/credentials`,
    ]);
  }

  /// A task of theirs on their onboarding checklist is due soon or overdue
  /// (see `checklists/onboarding-reminders.ts`). One message for all of them.
  async onboardingReminder(
    employeeId: string,
    words: { title: string; body: string },
  ): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { email: true, firstName: true, preferredName: true },
    });
    if (!employee) return;

    await this.inbox.notify([employeeId], {
      kind: NotificationKind.ONBOARDING_REMINDER,
      title: words.title,
      body: words.body,
      link: '/checklists',
    });

    await this.dispatch(employee.email, words.title, [
      `Hello ${employee.preferredName ?? employee.firstName},`,
      '',
      words.body,
      '',
      `Your onboarding checklist: ${this.appUrl}/checklists`,
    ]);
  }

  /// "You were clocked out automatically" — still clocked in at midnight (see
  /// `time-entries/auto-clock-out.service.ts`). A warning: the clock-out time
  /// is almost certainly wrong, and only they know the right one.
  async autoClockedOut(
    employeeId: string,
    entry: { clockInAt: Date; clockOutAt: Date },
  ): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { email: true, firstName: true, preferredName: true },
    });
    if (!employee) return;

    const since = `${clockTime(entry.clockInAt)} on ${practiceDay(entry.clockInAt)}`;

    await this.inbox.notify([employeeId], {
      kind: NotificationKind.PUNCH_REMINDER,
      title: 'You were clocked out automatically',
      body: `Still clocked in at midnight (since ${since}), so the app clocked you out at ${clockTime(entry.clockOutAt)}. Tell your manager what time you finished.`,
      link: '/timesheet',
    });

    await this.dispatch(employee.email, 'You were clocked out automatically', [
      `Hello ${employee.preferredName ?? employee.firstName},`,
      '',
      `You were still clocked in at midnight — since ${since} — so the app clocked you out at ${clockTime(entry.clockOutAt)}.`,
      '',
      'That is probably not when you finished. Tell your manager what time you really left, so they can correct it before your hours are approved.',
      '',
      'You can clock in today as usual.',
      '',
      `Your timesheet: ${this.appUrl}/timesheet`,
    ]);
  }

  /**
   * The nightly round-up of what nobody has got to yet — laid out in
   * `digest-email.ts`. Sections with nothing in them are left out entirely
   * rather than printed empty: an email that is mostly "nothing to report"
   * teaches people to skim past it, and then they skim past the one that
   * matters.
   */
  async dailyDigest(to: string, firstName: string, contents: DigestContents): Promise<void> {
    const message = digestEmail({
      firstName,
      contents,
      appUrl: this.appUrl,
      isTest: this.config.get<string>('APP_ENVIRONMENT') === 'test',
    });
    try {
      await this.email.send({
        to,
        subject: this.prefixed(message.subject),
        text: message.text,
        html: message.html,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Digest to ${to} failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /// The reset link itself. Sent to an address that may not belong to anyone —
  /// the caller decides that, and never says either way.
  /**
   * The welcome email, with the link to choose a first password. Unlike the
   * other messages the caller needs to know whether it went — the Staff screen
   * records who has been sent one — so this reports it, still without throwing.
   */
  async welcome(details: WelcomeDetails, to: string): Promise<EmailResult> {
    const message = welcomeEmail(details);
    try {
      return await this.email.send({
        to,
        subject: this.prefixed(message.subject),
        text: message.text,
        html: message.html,
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Welcome email to ${to} failed: ${reason}`);
      return { delivered: false, reason };
    }
  }

  async passwordReset(
    to: string,
    firstName: string,
    link: string,
    validMinutes: number,
  ): Promise<void> {
    await this.dispatch(to, 'Reset your Domi password', [
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

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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

/// "9:00 AM", on the practice's clock.
function clockTime(at: Date): string {
  return at.toLocaleTimeString('en-US', {
    timeZone: PRACTICE_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/// "Mon, Oct 5", on the practice's calendar.
function practiceDay(at: Date): string {
  return at.toLocaleDateString('en-US', {
    timeZone: PRACTICE_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
