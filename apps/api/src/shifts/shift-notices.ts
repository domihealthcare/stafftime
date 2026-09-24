import { NotificationKind, ShiftStatus } from '@prisma/client';
import type { NewNotification } from '../email/inbox.service';

/// The parts of a shift a notice about it needs.
export interface NoticeShift {
  employeeId: string | null;
  status: ShiftStatus;
  startsAt: Date;
  endsAt: Date;
  isRemote: boolean;
  location: { name: string; timezone: string };
}

/// "Tue, Sep 30, 9:00 AM–5:00 PM", on the office's own clock.
export function describeShift(shift: Pick<NoticeShift, 'startsAt' | 'endsAt' | 'location'>) {
  const zone = shift.location.timezone;
  const day = shift.startsAt.toLocaleDateString('en-US', {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = (at: Date) =>
    at.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time(shift.startsAt)}–${time(shift.endsAt)}`;
}

function where(shift: NoticeShift) {
  return shift.isRemote ? `Work from home (${shift.location.name})` : shift.location.name;
}

/// A shift somebody can see: published, and theirs.
function seenBy(shift: NoticeShift | null): string | null {
  return shift && shift.status === ShiftStatus.PUBLISHED ? shift.employeeId : null;
}

/**
 * What to tell whom when one shift goes from `before` to `after` (either may
 * be null: made, or removed).
 *
 * Only published shifts count. A draft is the manager's workings; the person
 * hears about it when it is published, as a new shift.
 */
export function shiftNotices(
  before: NoticeShift | null,
  after: NoticeShift | null,
): { employeeId: string; notice: NewNotification }[] {
  const was = seenBy(before);
  const now = seenBy(after);
  const notices: { employeeId: string; notice: NewNotification }[] = [];

  if (was && was !== now) {
    notices.push({
      employeeId: was,
      notice: {
        kind: NotificationKind.SCHEDULE_CHANGED,
        title: `Shift removed: ${describeShift(before!)}`,
        body: `${where(before!)}. It is no longer on your schedule.`,
        link: '/schedule',
      },
    });
  }
  if (now && now !== was) {
    notices.push({
      employeeId: now,
      notice: {
        kind: NotificationKind.SCHEDULE_CHANGED,
        title: `New shift: ${describeShift(after!)}`,
        body: `${where(after!)}.`,
        link: '/schedule',
      },
    });
  }
  if (now && now === was) {
    const moved =
      before!.startsAt.getTime() !== after!.startsAt.getTime() ||
      before!.endsAt.getTime() !== after!.endsAt.getTime() ||
      before!.location.name !== after!.location.name ||
      before!.isRemote !== after!.isRemote;
    if (moved) {
      notices.push({
        employeeId: now,
        notice: {
          kind: NotificationKind.SCHEDULE_CHANGED,
          title: `Shift changed: ${describeShift(after!)}`,
          body: `${where(after!)}. Was ${describeShift(before!)}, ${where(before!)}.`,
          link: '/schedule',
        },
      });
    }
  }
  return notices;
}
