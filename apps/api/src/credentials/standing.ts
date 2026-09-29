/**
 * Where somebody stands against the licenses their job roles ask for.
 *
 * Pure, so the rules are tested without a database. The service loads the
 * people, their job roles' requirements and their credentials, and this works
 * out each line.
 */

/// How far ahead a license counts as "due soon" — the same 60 days as the
/// Licenses screen and the nightly round-up.
export const DUE_SOON_DAYS = 60;

export type StandingState = 'CURRENT' | 'DUE_SOON' | 'EXPIRED' | 'MISSING';

export interface RequirementInput {
  credentialTypeId: string;
  required: boolean;
  jobRoleName: string;
  type: { id: string; name: string; kind: string; renewalMonths: number | null; sortOrder: number };
}

export interface CredentialInput {
  id: string;
  name: string;
  credentialTypeId: string | null;
  expiresOn: Date;
}

export interface StandingLine {
  type: RequirementInput['type'];
  /// Required by any of their job roles wins over optional in another.
  required: boolean;
  /// Which of their job roles ask for it, for "required for Provider".
  forRoles: string[];
  credential: { id: string; expiresOn: Date; daysUntilExpiry: number } | null;
  state: StandingState;
}

/**
 * One line per license type any of their job roles asks for, required first,
 * then in the practice's order.
 *
 * A credential counts for a type when it was recorded as that type, or —
 * for ones recorded free-hand before types existed — carries exactly its
 * name. The one that runs longest is the one that counts: a renewal
 * recorded alongside the old card should not leave them "expired".
 */
export function standingFor(
  requirements: RequirementInput[],
  credentials: CredentialInput[],
  today: Date,
): StandingLine[] {
  const byType = new Map<string, StandingLine>();
  for (const requirement of requirements) {
    const seen = byType.get(requirement.credentialTypeId);
    if (seen) {
      seen.required = seen.required || requirement.required;
      if (!seen.forRoles.includes(requirement.jobRoleName))
        seen.forRoles.push(requirement.jobRoleName);
      continue;
    }
    byType.set(requirement.credentialTypeId, {
      type: requirement.type,
      required: requirement.required,
      forRoles: [requirement.jobRoleName],
      credential: null,
      state: 'MISSING',
    });
  }

  for (const line of byType.values()) {
    const name = line.type.name.trim().toLowerCase();
    const matches = credentials.filter(
      (credential) =>
        credential.credentialTypeId === line.type.id ||
        (credential.credentialTypeId === null && credential.name.trim().toLowerCase() === name),
    );
    const best = matches.sort((a, b) => b.expiresOn.getTime() - a.expiresOn.getTime())[0];
    if (!best) continue;
    const days = Math.round((best.expiresOn.getTime() - today.getTime()) / 86_400_000);
    line.credential = { id: best.id, expiresOn: best.expiresOn, daysUntilExpiry: days };
    line.state = days < 0 ? 'EXPIRED' : days <= DUE_SOON_DAYS ? 'DUE_SOON' : 'CURRENT';
  }

  return [...byType.values()].sort(
    (a, b) =>
      Number(b.required) - Number(a.required) ||
      a.type.sortOrder - b.type.sortOrder ||
      a.type.name.localeCompare(b.type.name),
  );
}

/// The expiry a renewal interval suggests: the date it was done, plus the
/// interval. The 31st of a month with fewer days lands on its last day.
export function expiryFromInterval(doneOn: Date, months: number): Date {
  const year = doneOn.getUTCFullYear();
  const month = doneOn.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(doneOn.getUTCDate(), lastDay)));
}
