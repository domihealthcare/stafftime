import { NotificationKind, ShiftStatus } from '@prisma/client';
import type { NewNotification } from '../email/inbox.service';

/// The parts of a shift a notice about it needs.
export interface NoticeShift {
  employeeId: string | null;
  status: ShiftStatus;
  startsAt: Date;
  endsAt: Date;
  isRemote: boolean;
  /// The manager's note on it ("7–12 upstairs, 12–3 downstairs").
  notes?: string | null;
  location: { name: string; timezone: string };
  /// The job role it is worked in, when known: a change of role on a
  /// published shift is told like a change of hours (October 2026).
  jobRole?: { name: string } | null;
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
        body: `${where(after!)}.${after!.notes ? ` ${noteLine(after!.notes)}` : ''}`,
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
    // Only when both sides say which role: a caller that does not load it
    // leaves it out, and that is not a change.
    const roleChanged =
      before!.jobRole !== undefined &&
      after!.jobRole !== undefined &&
      (before!.jobRole?.name ?? null) !== (after!.jobRole?.name ?? null);
    const noteBefore = before!.notes ?? null;
    const noteAfter = after!.notes ?? null;
    const noteChanged = noteBefore !== noteAfter;
    if (moved || roleChanged) {
      const as = (shift: NoticeShift) =>
        roleChanged ? `, as ${shift.jobRole?.name ?? 'no set job role'}` : '';
      notices.push({
        employeeId: now,
        notice: {
          kind: NotificationKind.SCHEDULE_CHANGED,
          title: `Shift changed: ${describeShift(after!)}`,
          body: `${where(after!)}${as(after!)}. Was ${describeShift(before!)}, ${where(before!)}${as(before!)}.${
            noteChanged ? ` ${noteLine(noteAfter)}` : ''
          }`,
          link: '/schedule',
        },
      });
    } else if (noteChanged) {
      notices.push({
        employeeId: now,
        notice: {
          kind: NotificationKind.SCHEDULE_CHANGED,
          title: `Shift note ${noteAfter ? 'changed' : 'removed'}: ${describeShift(after!)}`,
          body: `${where(after!)}. ${noteLine(noteAfter)}`,
          link: '/schedule',
        },
      });
    }
  }
  return notices;
}

function noteLine(note: string | null) {
  return note ? `Note: ${note}` : 'It no longer has a note.';
}
