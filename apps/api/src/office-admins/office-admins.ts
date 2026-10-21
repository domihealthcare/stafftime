import { isoWeekdayOf } from '../common/util/zoned-time.util';

/**
 * Who is the admin in an office on a day (October 2026, Dominguez: "we need to
 * have an admin in WNY location daily except Friday - right now the schedule
 * is that Kayla is Wednesday, Tatiyanna is Monday and Celeste is Tuesday and
 * Angelica Notario Thursday").
 *
 * - The **usual pattern** names somebody for an office on a weekday.
 * - A **changed day** beats it: somebody else, or nobody.
 * - Somebody **no longer here** counts as nobody.
 *
 * Pure, and the only place these rules live. The rule that the rota has an
 * admin there is a staffing minimum (`staffing/minimums.ts`); this is who.
 */

export type AdminSource = 'USUAL' | 'CHANGED' | 'NONE';

export interface UsualAdmin {
  locationId: string;
  /// 1 = Monday … 7 = Sunday.
  weekday: number;
  employeeId: string;
}

export interface ChangedAdminDay {
  date: string;
  locationId: string;
  employeeId: string | null;
  note: string | null;
}

export interface AdminOnDay {
  date: string;
  locationId: string;
  employeeId: string | null;
  source: AdminSource;
  note: string | null;
  /// Whether the usual pattern has anybody for this office on this weekday,
  /// so a day nobody is wanted is told from a gap.
  usualDay: boolean;
}

export interface AdminRules {
  usual: Map<string, string>;
  changed: Map<string, ChangedAdminDay>;
  present: Set<string>;
}

export function adminRules(
  usual: UsualAdmin[],
  changed: ChangedAdminDay[],
  present: Iterable<string>,
): AdminRules {
  return {
    usual: new Map(usual.map((row) => [`${row.locationId}|${row.weekday}`, row.employeeId])),
    changed: new Map(changed.map((row) => [`${row.date}|${row.locationId}`, row])),
    present: new Set(present),
  };
}

export function adminOn(date: string, locationId: string, rules: AdminRules): AdminOnDay {
  const usualId = rules.usual.get(`${locationId}|${isoWeekdayOf(date)}`);
  const usualDay = usualId !== undefined;
  const here = (id: string | null | undefined) => (id && rules.present.has(id) ? id : null);
  const change = rules.changed.get(`${date}|${locationId}`);
  if (change) {
    return {
      date,
      locationId,
      employeeId: here(change.employeeId),
      source: 'CHANGED',
      note: change.note,
      usualDay,
    };
  }
  const employeeId = here(usualId);
  return {
    date,
    locationId,
    employeeId,
    source: employeeId ? 'USUAL' : 'NONE',
    note: null,
    usualDay,
  };
}

/// Why a manager might look twice at a day: the admin is off, or not on the
/// rota at that office (drafts count, working from home does not), or a day
/// the pattern wants somebody has nobody.
export type AdminConcern = 'OFF' | 'HALF_DAY_OFF' | 'NOT_ON_ROTA' | 'NOBODY';

export function concernsFor(
  day: AdminOnDay,
  facts: { onRota: boolean; off: 'FULL' | 'HALF' | null },
): AdminConcern[] {
  if (!day.employeeId) return day.usualDay ? ['NOBODY'] : [];
  const out: AdminConcern[] = [];
  if (facts.off === 'FULL') out.push('OFF');
  if (facts.off === 'HALF') out.push('HALF_DAY_OFF');
  if (!facts.onRota && facts.off !== 'FULL') out.push('NOT_ON_ROTA');
  return out;
}
