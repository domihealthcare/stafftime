import { Prisma, TimeEntryStatus } from '@prisma/client';

/**
 * Hours with nothing flagged — the ones a manager can approve in one go
 * (October 2026, Dominguez: "Approve the clean hours").
 *
 * "Clean" is exactly "no badge on the timesheet": closed, not already
 * approved, not waiting on review, and not late, left early, edited, missing a
 * punch, clocked out by the app at midnight, somewhere other than the shift, or
 * entered by hand. Everything flagged is left for somebody to look at one by
 * one, as before. The timesheet mirrors this in `isCleanEntry`
 * (`pages/TimesheetPage.tsx`) to count the button; the database decides.
 *
 * A where clause rather than a check in code, so the approval is one
 * `updateMany` and an entry edited between the manager loading the page and
 * pressing the button (it is then "Edited") is simply left out.
 */
export const CLEAN_ENTRY_WHERE: Prisma.TimeEntryWhereInput = {
  status: TimeEntryStatus.COMPLETED,
  clockOutAt: { not: null },
  isLate: false,
  isEarlyDeparture: false,
  isManuallyEdited: false,
  isMissingPunch: false,
  isOtherPlace: false,
  autoClockedOutAt: null,
  enteredByHandAt: null,
};
