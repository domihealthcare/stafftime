import type { DigestContents } from './attention.service';

/// Every section of the round-up by name. A Record, so a section added to
/// DigestContents and not here fails to compile.
const SECTION_NAMES: Record<keyof DigestContents, true> = {
  expiredCredentials: true,
  expiringCredentials: true,
  missingCredentials: true,
  overdueTasks: true,
  missingPunches: true,
  missedShifts: true,
  payrollDue: true,
  correctionsAsked: true,
  cmeWaiting: true,
  regularShiftClashes: true,
  belowMinimum: true,
  undecidedTimeOff: true,
  silentKiosks: true,
  unpublishedRota: true,
  unapprovedHours: true,
  handEntries: true,
  shiftsForLeavers: true,
  openShifts: true,
  shiftsInClosures: true,
  closingGaps: true,
  suppliesNeeded: true,
  newSuggestions: true,
  punchPatterns: true,
  timeOffClashes: true,
  overtimeHeading: true,
  downtime: true,
};

export const ATTENTION_SECTIONS = Object.keys(SECTION_NAMES) as (keyof DigestContents)[];

/**
 * `?sections=closingGaps,suppliesNeeded` from a screen's banner, as the set
 * of sections to work out. Names it does not know are ignored; with none it
 * knows (or no parameter) it is undefined, meaning all of them, as before.
 */
export function parseSections(raw: unknown): Set<keyof DigestContents> | undefined {
  if (typeof raw !== 'string' || raw.length > 1000) return undefined;
  const picked = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name): name is keyof DigestContents =>
      Object.prototype.hasOwnProperty.call(SECTION_NAMES, name),
    );
  return picked.length > 0 ? new Set(picked) : undefined;
}
