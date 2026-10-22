/**
 * What Manage holds, grouped (October 2026, Dominguez: "lets cut down the
 * manage options - job roles can be with staff, locations and kiosks together,
 * etc."). Fifteen separate screens were a long list to hunt through, so they
 * sit under five headings and each heading opens one of its screens with a
 * strip of tabs to the rest. The screens, their addresses and what each
 * person may open are unchanged - only where they are reached from.
 *
 * Renamed on 22 October 2026 (Dominguez): People is **Staff**, Money is
 * **Finances**, and Provider productivity sits under Finances.
 */

/// Who may open a screen: managers and admins, admins only, the people an
/// admin has chosen for provider productivity (and admins), or Manager access
/// only, admins not (invoices, October 2026).
export type ManageNeed = 'manager' | 'admin' | 'productivity' | 'managerAccessOnly';

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
    label: 'Staff',
    tabs: [
      // Staff and the job roles are one screen (October 2026, Dominguez: "can
      // we merge the Staff and Job Roles?"): managers, who keep the job roles,
      // open it too and see the cards without the admin's tools.
      { to: '/staff', label: 'Staff', need: 'manager' },
      { to: '/credentials', label: 'Licenses', need: 'manager' },
      { to: '/cme', label: 'CME', need: 'manager' },
      { to: '/checklists', label: 'Onboarding & Offboarding', need: 'manager' },
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
    label: 'Finances',
    tabs: [
      { to: '/export', label: 'Export', need: 'manager' },
      { to: '/reimbursements', label: 'Reimbursements', need: 'manager' },
      { to: '/invoices', label: 'Invoices', need: 'managerAccessOnly' },
      { to: '/vendors', label: 'Vendor payments', need: 'admin' },
      { to: '/productivity', label: 'Provider productivity', need: 'productivity' },
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
      : need === 'managerAccessOnly'
        ? access.isManager && !access.isAdmin
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
