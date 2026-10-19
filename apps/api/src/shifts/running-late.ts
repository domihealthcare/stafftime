import { PRACTICE_ZONE } from '../common/util/zoned-time.util';

/**
 * "Running late" and the no-show alert (October 2026, Dominguez - two
 * "smarter" ideas). The words, kept apart from the sending so they can be
 * tested on their own.
 */

/// The choices on Home's button, in minutes.
export const LATE_CHOICES = [10, 20, 30, 45, 60];

/// How long into a shift with no clock-in the office's managers are told.
export const NO_SHOW_AFTER_MINUTES = 30;

/// Somebody who said they would be late is not reported as a no-show until
/// this long after the time they gave.
export const NO_SHOW_GRACE_MINUTES = 15;

/// "Running late" can be said from this long before a shift starts until it
/// ends.
export const LATE_FROM_MINUTES_BEFORE = 180;

export interface LateShift {
  startsAt: Date;
  isRemote: boolean;
  locationName: string;
}

const time = (at: Date) =>
  at.toLocaleTimeString('en-US', { timeZone: PRACTICE_ZONE, hour: 'numeric', minute: '2-digit' });

const where = (shift: LateShift) =>
  shift.isRemote ? 'working from home' : `at ${shift.locationName}`;

/// To the office's managers when somebody says they are running late.
export function runningLateWords(name: string, shift: LateShift, minutes: number) {
  return {
    title: `${name} is running late`,
    body: `About ${minutes} minutes late for ${time(shift.startsAt)} ${where(shift)} - expected around ${time(new Date(shift.startsAt.getTime() + minutes * 60_000))}.`,
    link: '/directory',
  };
}

/// To the office's managers, 30 minutes into a shift with no clock-in.
export function noShowWords(name: string, shift: LateShift, saidLate: number | null) {
  return {
    title: `${name} isn't clocked in for ${time(shift.startsAt)} ${where(shift)}`,
    body:
      saidLate === null
        ? `Their shift started ${NO_SHOW_AFTER_MINUTES} minutes ago and nothing has been heard from them.`
        : `They said they would be about ${saidLate} minutes late, and are not in yet.`,
    link: '/directory',
  };
}
