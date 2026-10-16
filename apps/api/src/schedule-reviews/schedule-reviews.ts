import { isoWeekdayOf } from '../common/util/zoned-time.util';

/**
 * Who reviews a provider's patient schedule on a day (October 2026,
 * Dominguez: "admin/manager/staff that are responsible for reviewing providers
 * schedule … so they are aware they are to review a certain schedule and
 * others are aware which schedule is being reviewed").
 *
 * - The **usual pattern** gives each provider a reviewer per weekday.
 * - A **changed day** beats it: somebody else, or nobody.
 * - A reviewer who is **no longer here** counts as nobody, so a schedule is
 *   never shown as covered by somebody who has left.
 *
 * Pure, and the only place these rules live. Only who reviews which
 * provider's schedule: never a patient or an appointment.
 */

export type ReviewSource = 'USUAL' | 'CHANGED' | 'NONE';

export interface UsualReviewer {
  providerId: string;
  /// 1 = Monday … 7 = Sunday.
  weekday: number;
  reviewerId: string;
}

export interface ChangedReviewDay {
  date: string;
  providerId: string;
  reviewerId: string | null;
  note: string | null;
}

export interface ReviewOnDay {
  date: string;
  providerId: string;
  reviewerId: string | null;
  source: ReviewSource;
  note: string | null;
}

export interface ReviewRules {
  usual: Map<string, string>;
  changed: Map<string, ChangedReviewDay>;
  /// Who is still here: anybody else counts as nobody.
  present: Set<string>;
}

export function reviewRules(
  usual: UsualReviewer[],
  changed: ChangedReviewDay[],
  present: Iterable<string>,
): ReviewRules {
  return {
    usual: new Map(usual.map((row) => [`${row.providerId}|${row.weekday}`, row.reviewerId])),
    changed: new Map(changed.map((row) => [`${row.date}|${row.providerId}`, row])),
    present: new Set(present),
  };
}

export function reviewOn(date: string, providerId: string, rules: ReviewRules): ReviewOnDay {
  const change = rules.changed.get(`${date}|${providerId}`);
  const here = (id: string | null | undefined) => (id && rules.present.has(id) ? id : null);
  if (change) {
    return {
      date,
      providerId,
      reviewerId: here(change.reviewerId),
      source: 'CHANGED',
      note: change.note,
    };
  }
  const reviewerId = here(rules.usual.get(`${providerId}|${isoWeekdayOf(date)}`));
  return { date, providerId, reviewerId, source: reviewerId ? 'USUAL' : 'NONE', note: null };
}
