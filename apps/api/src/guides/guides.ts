import { GuideKey, Role } from '@prisma/client';

/**
 * Which guide is which (October 2026, Dominguez). Who reads each is set on
 * Resources by managers (`tool-access/`); managers and admins keep all three.
 */

export const GUIDE_SLUGS: Record<string, GuideKey> = {
  'front-desk': GuideKey.FRONT_DESK,
  'results-playbook': GuideKey.RESULTS_PLAYBOOK,
  'inpatient-notes': GuideKey.INPATIENT_NOTES,
  downtime: GuideKey.DOWNTIME,
};

export const GUIDE_LABELS: Record<string, string> = {
  'front-desk': 'Front desk guide',
  'results-playbook': 'Results playbook',
  'inpatient-notes': 'Inpatient notes',
  downtime: 'Downtime procedures',
};

/// Guides for everybody signed in, not chosen on Resources: the downtime
/// procedures (October 2026) are for every job role.
export const GUIDES_FOR_EVERYONE: GuideKey[] = [GuideKey.DOWNTIME];

export const canEditGuide = (role: Role) => role === Role.MANAGER || role === Role.ADMIN;
