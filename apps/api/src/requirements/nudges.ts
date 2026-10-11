import { RequirementKind } from '@prisma/client';
import { addDaysTo } from '../common/util/zoned-time.util';

/**
 * When somebody is reminded about something they have been asked to read or
 * do (October 2026, Dominguez: "nag" — never a gate). Told once when it is
 * set; after that:
 *
 * - **With a due date**: two days before it, the day after it passes, and
 *   then once a week.
 * - **Without one**: once a week after it was set.
 *
 * At most `MAX_WEEKS` weekly reminders — after two months of emails, it is a
 * conversation for a manager, who can see who is still to do it and press
 * **Remind them now**. The card on Home stays until it is done either way.
 *
 * Nothing on the day it was set: being told about it has just said it.
 * Somebody who joins the audience later (a new hire in the job role) is
 * reminded at the next reminder day, which is their first word of it.
 *
 * Pure: `RequirementsService.nudge` reads who is still to do what, claims
 * each reminder and sends one message per person.
 */

export const DUE_SOON_DAYS = 2;
export const MAX_WEEKS = 8;

export type NudgeStage = 'DUE_SOON' | 'OVERDUE' | 'WAITING';

export interface NudgeInput {
  /// Plain dates, "YYYY-MM-DD", in New Jersey.
  createdOn: string;
  dueOn: string | null;
  /// The last reminder this person had about it, or null for none.
  lastOn: string | null;
  today: string;
}

/// The reminder due today, or null. Only the latest reminder day that has
/// come counts: somebody away for a fortnight gets one message, not three.
export function nudgeDue({ createdOn, dueOn, lastOn, today }: NudgeInput): NudgeStage | null {
  let latest: { on: string; stage: NudgeStage } | null = null;
  for (const day of reminderDays(createdOn, dueOn)) {
    if (day.on > today) break;
    if (day.on > createdOn) latest = day;
  }
  if (!latest) return null;
  if (lastOn !== null && lastOn >= latest.on) return null;
  return latest.stage;
}

/// Every reminder day, earliest first.
export function reminderDays(
  createdOn: string,
  dueOn: string | null,
): { on: string; stage: NudgeStage }[] {
  if (dueOn) {
    const days: { on: string; stage: NudgeStage }[] = [
      { on: addDaysTo(dueOn, -DUE_SOON_DAYS), stage: 'DUE_SOON' },
    ];
    for (let week = 0; week <= MAX_WEEKS; week++) {
      days.push({ on: addDaysTo(dueOn, 1 + week * 7), stage: 'OVERDUE' });
    }
    return days;
  }
  return Array.from({ length: MAX_WEEKS }, (_, index) => ({
    on: addDaysTo(createdOn, (index + 1) * 7),
    stage: 'WAITING' as const,
  }));
}

export interface WaitingItem {
  kind: RequirementKind;
  title: string;
  dueOn: string | null;
  stage: NudgeStage;
}

/// "Please read …" / "To do: …" — the first word of it.
export function askedWording(item: {
  kind: RequirementKind;
  title: string;
  dueOn: string | null;
}): { title: string; body: string } {
  const read = item.kind === RequirementKind.READ;
  return {
    title: read ? `Please read and confirm: “${item.title}”` : `To do: “${item.title}”`,
    body: `${item.dueOn ? `By ${day(item.dueOn)}. ` : ''}${
      read
        ? 'Read it, then press “I’ve read it” on Home so the practice knows.'
        : 'Once it is done, press “Done” on Home so the practice knows.'
    }`,
  };
}

/// One message for everything waiting on one person.
export function nudgeWording(items: WaitingItem[]): { title: string; body: string } {
  const sorted = [...items].sort(
    (a, b) =>
      (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.title.localeCompare(b.title),
  );
  const press = 'Press “I’ve read it” or “Done” on Home once you have.';
  if (sorted.length === 1) {
    const [only] = sorted;
    const what = only.kind === RequirementKind.READ ? 'to read' : 'to do';
    if (only.stage === 'DUE_SOON' && only.dueOn) {
      return {
        title: `Reminder: “${only.title}” is due ${day(only.dueOn)}`,
        body: `Still ${what}. ${press}`,
      };
    }
    if (only.stage === 'OVERDUE' && only.dueOn) {
      return {
        title: `Still waiting: “${only.title}” was due ${day(only.dueOn)}`,
        body: `Still ${what}. ${press}`,
      };
    }
    return { title: `Still waiting: “${only.title}”`, body: `Still ${what}. ${press}` };
  }
  const lines = sorted.map(
    (item) =>
      `“${item.title}”${
        item.dueOn ? ` — ${item.stage === 'OVERDUE' ? 'was due' : 'due'} ${day(item.dueOn)}` : ''
      }`,
  );
  return {
    title: `${sorted.length} things are waiting for you`,
    body: `${lines.join('; ')}. ${press}`,
  };
}

export function day(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
