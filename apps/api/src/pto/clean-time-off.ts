import { PtoType } from '@prisma/client';

/**
 * "Approve the clean time off" (October 2026, Dominguez - a "smarter" idea,
 * like "Approve the clean hours"). What makes a request clean: PTO or sick,
 * with enough left of it once this request is counted, nobody left too thin
 * by it ("Too many off at once"), and no shift of theirs still to come in the
 * dates. Anything else is worth a look one at a time.
 */
export interface RequestFacts {
  type: PtoType;
  /// What is left of that allowance, this request and every other waiting
  /// one counted - null for a kind that draws on no allowance.
  remaining: number | null;
  clashes: number;
  shifts: number;
}

/// Why it is not clean, or null when it is.
export function notCleanBecause(facts: RequestFacts): string | null {
  if (facts.type !== PtoType.VACATION && facts.type !== PtoType.SICK) {
    return 'not PTO or sick';
  }
  if (facts.remaining !== null && facts.remaining < 0) return 'more days than are left';
  if (facts.clashes > 0) return 'too many off at once';
  if (facts.shifts > 0) return 'lands on shifts';
  return null;
}
