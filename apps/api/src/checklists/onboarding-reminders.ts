import { ChecklistReminderStage } from '@prisma/client';

/**
 * Reminders to a new hire about their own onboarding tasks (October 2026,
 * Dominguez — making the app smarter). The checklist told them when it
 * started how many tasks were theirs; after that only managers were chased,
 * by the nightly email, once a task was already overdue. Now the person is
 * told themselves, in time to do it.
 *
 * Only tasks **theirs to do** (`TaskOwner.EMPLOYEE`), still to do, with a due
 * date, on an **onboarding** checklist still open. Two moments, each said
 * once for a given due date: **due soon** (today, tomorrow or the day after)
 * and **overdue** (for two weeks after — then it is the managers' list's
 * business, which already carries it). Only the most pressing that applies.
 * Nothing on the day the checklist starts: "your checklist has started" has
 * just said it.
 *
 * Pure: `OnboardingRemindersService` reads the tasks, records each reminder
 * before it goes, and sends one message per person.
 */

export const DUE_SOON_DAYS = 2;
export const OVERDUE_FOR_DAYS = 14;

export interface ReminderTask {
  id: string;
  employeeId: string;
  title: string;
  /// Plain date, "YYYY-MM-DD".
  dueOn: string;
  /// The day the checklist was started, in New Jersey.
  checklistStartedOn: string;
}

export interface DueTaskReminder {
  task: ReminderTask;
  stage: ChecklistReminderStage;
  /// Days from today to the due date; negative once it is overdue.
  daysLeft: number;
}

export function dueTaskReminders(tasks: ReminderTask[], today: string): DueTaskReminder[] {
  return tasks.flatMap((task) => {
    if (task.checklistStartedOn >= today) return [];
    const daysLeft = daysBetween(today, task.dueOn);
    const stage = taskStageFor(daysLeft);
    return stage ? [{ task, stage, daysLeft }] : [];
  });
}

export function taskStageFor(daysLeft: number): ChecklistReminderStage | null {
  if (daysLeft < -OVERDUE_FOR_DAYS) return null;
  if (daysLeft < 0) return ChecklistReminderStage.OVERDUE;
  if (daysLeft <= DUE_SOON_DAYS) return ChecklistReminderStage.DUE_SOON;
  return null;
}

/// One message for everything due for one person: the bell and the email.
export function taskReminderWording(reminders: DueTaskReminder[]): {
  title: string;
  body: string;
} {
  const sorted = [...reminders].sort(
    (a, b) => a.daysLeft - b.daysLeft || a.task.title.localeCompare(b.task.title),
  );
  const tickOff = 'Tick it off on your onboarding checklist once it is done';
  if (sorted.length === 1) {
    const [only] = sorted;
    if (only.stage === ChecklistReminderStage.OVERDUE) {
      return {
        title: `Onboarding: “${only.task.title}” was due ${day(only.task.dueOn)}`,
        body: `It is yours to do. ${tickOff}, or tell a manager if something is in the way.`,
      };
    }
    return {
      title: `Onboarding: “${only.task.title}” is due ${when(only.daysLeft)}`,
      body: `It is yours to do, by ${day(only.task.dueOn)}. ${tickOff}.`,
    };
  }
  const lines = sorted.map(
    ({ task, stage, daysLeft }) =>
      `“${task.title}” — ${
        stage === ChecklistReminderStage.OVERDUE
          ? `was due ${day(task.dueOn)}`
          : `due ${when(daysLeft)}`
      }`,
  );
  return {
    title: `${sorted.length} of your onboarding tasks need doing`,
    body: `${lines.join('; ')}. Tick each off on your onboarding checklist once it is done, or tell a manager if something is in the way.`,
  };
}

function when(daysLeft: number): string {
  if (daysLeft === 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  return `in ${daysLeft} days`;
}

function day(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
