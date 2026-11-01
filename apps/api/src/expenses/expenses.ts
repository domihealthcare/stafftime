import { addDaysTo } from '../common/util/zoned-time.util';
import { payPeriodContaining } from '../settings/pay-period';
import { DUE_WORKING_DAYS, workingDaysBefore } from '../time-entries/payroll-due';

/**
 * Expense reimbursements (1 November 2026, Dominguez): anybody asks to be
 * paid back for their own money spent for the practice. His choices:
 *
 * - **Everyone** may ask; what kind of expense it was is **optional**.
 * - **The people on a list approve** (he and Angelica Dominguez to start),
 *   whatever their access level, like the invoices list.
 * - **The receipt is required, by email**: the person ticks that they emailed
 *   it, and the approver ticks that it arrived. No receipt is kept in the app.
 * - **Never part of payroll**, but whoever runs payroll is **asked about
 *   every approved one not paid yet, CME included**: record how it was paid
 *   (a paper check, say) or put it off until the next payroll ("Not this
 *   time").
 *
 * Pure, and the only place these rules live. Money in cents.
 */

/// The most one expense may be: $10,000.
export const MAX_EXPENSE_CENTS = 1_000_000;
/// How long ago the money may have been spent.
export const EXPENSE_DAYS_BACK = 366;

export interface ExpenseInput {
  description: string;
  spentOn: string;
  amountCents: number;
  receiptEmailed: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/// What is wrong with a request, in words for the person, or null.
export function expenseProblem(input: ExpenseInput, today: string): string | null {
  if (input.description.trim().length < 3) return 'Enter a description.';
  if (!DATE_ONLY.test(input.spentOn)) return 'Enter the date of purchase.';
  if (input.spentOn > today) return 'The date of purchase cannot be in the future.';
  if (input.spentOn < addDaysTo(today, -EXPENSE_DAYS_BACK)) {
    return 'That was more than a year ago.';
  }
  if (
    !Number.isInteger(input.amountCents) ||
    input.amountCents < 1 ||
    input.amountCents > MAX_EXPENSE_CENTS
  ) {
    return 'The amount is from $0.01 to $10,000.';
  }
  if (!input.receiptEmailed) return 'Email the receipt to the approvers, then confirm it.';
  return null;
}

/// The day a reimbursement put off with "Not this time" comes back: the day
/// the next payroll's window opens (two working days before a pay period
/// ends, as for "Payroll is due"), so it is asked about again at the next
/// payroll and not before. With no pay period set, two weeks on.
export function nextPayrollFrom(today: string, anchor: string | null): string {
  if (!anchor) return addDaysTo(today, 14);
  let period = payPeriodContaining(addDaysTo(today, -14), anchor);
  for (let i = 0; i < 6; i += 1) {
    const opens = workingDaysBefore(period.to, DUE_WORKING_DAYS);
    // A window already open today belongs to the payroll being done now.
    if (opens > today) return opens;
    period = payPeriodContaining(addDaysTo(period.to, 1), anchor);
  }
  return addDaysTo(today, 14);
}

/// "a paper check", for sentences.
export const METHOD_WORDS = {
  PAPER_CHECK: 'a paper check',
  CASH: 'cash',
  DIRECT_DEPOSIT: 'direct deposit',
  OTHER: 'another method',
} as const;
