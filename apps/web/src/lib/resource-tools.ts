import { canUseCarePlan, canUseCognitiveAssessment, canUseWellnessForm } from './clinical-access';
import type { Employee, ResourceSection } from './types';

/**
 * The forms and guides built into Domi Staff, and which Resources section each
 * belongs in (October 2026, Dominguez: "the forms/references should go in the
 * subsections that they are supposed to (i.e. Braincheck careplan and results
 * playbook and inpatient notes to providers, front desk guide to frontdesk,
 * phonebook for everyone, etc.)").
 *
 * A tool shows only to somebody who may open it, in the first section of its
 * home they can see. One they may open whose home they cannot see (a job role
 * missing, or not theirs) goes under Everyone, so nothing goes missing.
 */

export interface ResourceTool {
  key: string;
  to: string;
  title: string;
  description: string;
  /// Shown with a badge: who it is kept to.
  badge?: string;
  /// Whether the person may open it at all.
  can: (employee: Employee) => boolean;
  /// Whether a section is where it lives (null is Everyone).
  home: (role: ResourceSection['jobRole']) => boolean;
}

const isManager = (employee: Employee) => employee.role === 'MANAGER' || employee.role === 'ADMIN';
const everyone = (role: ResourceSection['jobRole']) => role === null;
const providers = (role: ResourceSection['jobRole']) => role?.usesClinicalForms === true;
const named = (pattern: RegExp) => (role: ResourceSection['jobRole']) =>
  role !== null && pattern.test(role.name);

export const RESOURCE_TOOLS: ResourceTool[] = [
  {
    key: 'phone-book',
    to: '/phone-book',
    title: 'Phone book',
    description:
      'Labs, hospitals, imaging, home care, equipment and specialists we refer to - searchable, and yours to keep up to date.',
    can: () => true,
    home: everyone,
  },
  {
    key: 'diagnostics',
    to: '/diagnostics',
    title: 'Diagnostics',
    description:
      'Which insurance covers which ultrasound or test, how long it takes, the prep and the self-pay price.',
    can: () => true,
    home: everyone,
  },
  {
    key: 'front-desk',
    to: '/front-desk',
    title: 'Front desk guide',
    description:
      'Booking rules, results calls, message scripts to copy, payments, uploading and medications.',
    can: () => true,
    home: named(/front\s*desk/i),
  },
  {
    key: 'braincheck',
    to: '/clinical/99483',
    title: 'BrainCheck Care Plan',
    description:
      'Cognitive assessment and care plan (CPT 99483). Fill it in during the visit; download the note for eCW and the care plan for the patient. Nothing is saved.',
    can: canUseCognitiveAssessment,
    home: providers,
  },
  {
    key: 'apcm',
    to: '/clinical/care-plan',
    title: 'APCM Care Plan',
    description:
      'For CCM and APCM: the general care plan and two or more chronic conditions, as one PDF in English, or English and Spanish. Nothing is saved.',
    can: canUseCarePlan,
    home: providers,
  },
  {
    key: 'wellness',
    to: '/clinical/wellness',
    title: 'Annual Wellness Visit',
    description:
      'The Annual Wellness Supplement Form: the medical assistant does page 2 (preventive services), the provider page 1 in the patient’s language. Each page downloads for eCW. Nothing is saved.',
    can: canUseWellnessForm,
    home: (role) => role?.usesWellnessForm === true,
  },
  {
    key: 'results-playbook',
    to: '/results-playbook',
    title: 'Results playbook',
    description: 'What to do with each result, and when action is needed.',
    can: (employee) => isManager(employee) || employee.usesClinicalForms === true,
    home: providers,
  },
  {
    key: 'inpatient-notes',
    to: '/inpatient-notes',
    title: 'Inpatient notes',
    description: 'Hospital note templates to copy, and the hospital care codes by time.',
    can: (employee) => isManager(employee) || employee.usesClinicalForms === true,
    home: providers,
  },
  {
    key: 'reimbursements',
    to: '/reimbursements',
    title: 'Reimbursements',
    description: 'What each insurance pays for each code, searchable.',
    badge: 'Managers and admins',
    can: isManager,
    home: named(/^manager/i),
  },
];

/// Each section's tools, keyed by the section's job role id ('everyone' for
/// the section with none), for the sections the person can see.
export function toolsBySection(
  sections: ResourceSection[],
  employee: Employee | null,
): Map<string, ResourceTool[]> {
  const placed = new Map<string, ResourceTool[]>();
  if (!employee) return placed;
  const keyOf = (section: ResourceSection) => section.jobRole?.id ?? 'everyone';
  for (const tool of RESOURCE_TOOLS) {
    if (!tool.can(employee)) continue;
    const home =
      // Staff's own section first, so a manager in the role sees it where staff do.
      sections.find((section) => section.yours && tool.home(section.jobRole)) ??
      sections.find((section) => tool.home(section.jobRole)) ??
      sections.find((section) => section.jobRole === null);
    const key = home ? keyOf(home) : 'everyone';
    placed.set(key, [...(placed.get(key) ?? []), tool]);
  }
  return placed;
}
