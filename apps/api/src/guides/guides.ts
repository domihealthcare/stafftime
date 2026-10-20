import { GuideKey, Role } from '@prisma/client';

/**
 * Which guide is which, and who reads it (October 2026, Dominguez). Pure, so
 * the rule is tested on its own.
 *
 * The front desk guide is for everybody signed in: it holds the practice's
 * booking rules, scripts and abbreviations, nothing private. The results
 * playbook and the inpatient note templates are the providers' (a job role
 * with the clinical forms), and managers' and admins'. Managers and admins
 * keep all three.
 */

export const GUIDE_SLUGS: Record<string, GuideKey> = {
  'front-desk': GuideKey.FRONT_DESK,
  'results-playbook': GuideKey.RESULTS_PLAYBOOK,
  'inpatient-notes': GuideKey.INPATIENT_NOTES,
};

export const PROVIDER_GUIDES: GuideKey[] = [GuideKey.RESULTS_PLAYBOOK, GuideKey.INPATIENT_NOTES];

export function canReadGuide(key: GuideKey, role: Role, isProvider: boolean): boolean {
  if (!PROVIDER_GUIDES.includes(key)) return true;
  return role === Role.MANAGER || role === Role.ADMIN || isProvider;
}

export const canEditGuide = (role: Role) => role === Role.MANAGER || role === Role.ADMIN;
