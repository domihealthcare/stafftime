/**
 * What Manage holds, grouped (October 2026, Dominguez: "lets cut down the
 * manage options - job roles can be with staff, locations and kiosks together,
 * etc."). Fifteen separate screens were a long list to hunt through, so they
 * sit under five headings and each heading opens one of its screens with a
 * strip of tabs to the rest. The screens, their addresses and what each
 * person may open are unchanged - only where they are reached from.
 */

/// Who may open a screen: managers and admins, admins only, or the people an
/// admin has chosen for provider productivity (and admins).
export type ManageNeed = 'manager' | 'admin' | 'productivity';

export interface ManageTab {
  to: string;
  label: string;
  need: ManageNeed;
}

export interface ManageSection {
  label: string;
  tabs: ManageTab[];
}

export const MANAGE_SECTIONS: ManageSection[] = [
  { label: 'Dashboard', tabs: [{ to: '/dashboard', label: 'Dashboard', need: 'manager' }] },
  {
    label: 'People',
    tabs: [
      { to: '/staff', label: 'Staff', need: 'admin' },
      { to: '/job-roles', label: 'Job roles', need: 'manager' },
      { to: '/credentials', label: 'Licenses', need: 'manager' },
      { to: '/checklists', label: 'Onboarding & Offboarding', need: 'manager' },
      { to: '/productivity', label: 'Provider productivity', need: 'productivity' },
    ],
  },
  {
    label: 'Offices',
    tabs: [
      { to: '/locations', label: 'Locations', need: 'admin' },
      { to: '/kiosks', label: 'Kiosks', need: 'admin' },
      { to: '/closing', label: 'Closing checklists', need: 'manager' },
      { to: '/reps', label: 'Reps', need: 'manager' },
    ],
  },
  {
    label: 'Surveys & reading',
    tabs: [
      { to: '/surveys', label: 'Surveys', need: 'manager' },
      { to: '/required', label: 'Required reading', need: 'manager' },
    ],
  },
  {
    label: 'Money',
    tabs: [
      { to: '/export', label: 'Export', need: 'manager' },
      { to: '/reimbursements', label: 'Reimbursements', need: 'manager' },
      { to: '/vendors', label: 'Vendor payments', need: 'admin' },
    ],
  },
];

export interface ManageAccess {
  isManager: boolean;
  isAdmin: boolean;
  canManageProductivity: boolean;
}

const allowed = (need: ManageNeed, access: ManageAccess) =>
  need === 'manager'
    ? access.isManager
    : need === 'admin'
      ? access.isAdmin
      : access.canManageProductivity || access.isAdmin;

/// The sections this person can open, each with only the tabs they may use;
/// a section with nothing for them is left out.
export function visibleSections(access: ManageAccess): ManageSection[] {
  return MANAGE_SECTIONS.map((section) => ({
    ...section,
    tabs: section.tabs.filter((tab) => allowed(tab.need, access)),
  })).filter((section) => section.tabs.length > 0);
}

export const onPath = (to: string, pathname: string) =>
  pathname === to || pathname.startsWith(`${to}/`);

/// The section a screen belongs to, if it is one of Manage's.
export function sectionFor(sections: ManageSection[], pathname: string) {
  return sections.find((section) => section.tabs.some((tab) => onPath(tab.to, pathname)));
}
