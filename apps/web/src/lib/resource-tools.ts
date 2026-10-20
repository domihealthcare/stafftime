import { canUseTool } from './clinical-access';
import type { Employee, ResourceSection, ToolSetting } from './types';

/**
 * The forms and guides built into Domi Staff, as Resources lists them
 * (October 2026, Dominguez). Who may use each - everyone, or one or more job
 * roles - is the managers' choice (Dominguez: "there should be an option for
 * managers ... to make the form available for either one group or multiple
 * groups of job roles"), kept by the server (`tool-access/`), and it decides
 * where each is listed too: under Everyone, or under each chosen job role.
 *
 * Somebody sees a tool only if they may open it, in the sections of its job
 * roles they can see; one they may open whose sections they cannot see (a
 * manager or admin, say) is listed under Everyone, so nothing goes missing.
 * Managers and admins see every tool, to set who uses it.
 */

export interface ResourceTool {
  key: string;
  to: string;
  title: string;
  description: string;
  /// A different link and title in a section: the wellness form opens on the
  /// page that section's people do.
  variantFor?: (role: ResourceSection['jobRole']) => { to: string; title: string } | undefined;
}

export const RESOURCE_TOOLS: ResourceTool[] = [
  {
    key: 'phone-book',
    to: '/phone-book',
    title: 'Phone book',
    description:
      'Labs, hospitals, imaging, home care, equipment and specialists we refer to - searchable, and yours to keep up to date.',
  },
  {
    key: 'diagnostics',
    to: '/diagnostics',
    title: 'Diagnostics',
    description:
      'Which insurance covers which ultrasound or test, how long it takes, the prep and the self-pay price.',
  },
  {
    key: 'front-desk',
    to: '/front-desk',
    title: 'Front desk guide',
    description:
      'Booking rules, results calls, message scripts to copy, payments, uploading and medications.',
  },
  {
    key: 'braincheck',
    to: '/clinical/99483',
    title: 'BrainCheck Care Plan',
    description:
      'Cognitive assessment and care plan (CPT 99483). Fill it in during the visit; download the note for eCW and the care plan for the patient. Nothing is saved.',
  },
  {
    key: 'apcm',
    to: '/clinical/care-plan',
    title: 'APCM Care Plan',
    description:
      'For CCM and APCM: the general care plan and two or more chronic conditions, as one PDF in English, or English and Spanish. Nothing is saved.',
  },
  {
    key: 'wellness',
    to: '/clinical/wellness',
    title: 'Annual Wellness Visit',
    description:
      'The Annual Wellness Supplement Form: the medical assistant does page 2 (preventive services), the provider page 1 in the patient’s language. Each page downloads for eCW. Nothing is saved.',
    // One form, two pages: the provider's section opens page 1, any other
    // job role's page 2 (Dominguez: "AWV has to be for both").
    variantFor: (role) =>
      role === null
        ? undefined
        : role.usesClinicalForms
          ? { to: '/clinical/wellness?page=1', title: 'Annual Wellness Visit, page 1 (provider)' }
          : {
              to: '/clinical/wellness?page=2',
              title: 'Annual Wellness Visit, page 2 (preventive services)',
            },
  },
  {
    key: 'results-playbook',
    to: '/results-playbook',
    title: 'Results playbook',
    description: 'What to do with each result, and when action is needed.',
  },
  {
    key: 'inpatient-notes',
    to: '/inpatient-notes',
    title: 'Inpatient notes',
    description: 'Hospital note templates to copy, and the hospital care codes by time.',
  },
];

export interface PlacedTool extends ResourceTool {
  /// The link in this section.
  href: string;
  /// Who it is for; none for Reimbursements, which is always the managers'.
  setting?: ToolSetting;
  /// Whether the person may open it (managers see the rest, to set them up).
  usable: boolean;
}

/// Reimbursements is not for choosing: the contracted rates are the managers'
/// and admins' alone (the server says so), so it sits in the Manager section.
const REIMBURSEMENTS: ResourceTool = {
  key: 'reimbursements',
  to: '/reimbursements',
  title: 'Reimbursements',
  description: 'What each insurance pays for each code, searchable. Managers and admins only.',
};

const isManager = (employee: Employee) => employee.role === 'MANAGER' || employee.role === 'ADMIN';

/// Each section's tools, keyed by the section's job role id ('everyone' for
/// the section with none), for the sections the person can see.
export function toolsBySection(
  sections: ResourceSection[],
  settings: ToolSetting[],
  employee: Employee | null,
): Map<string, PlacedTool[]> {
  const placed = new Map<string, PlacedTool[]>();
  if (!employee) return placed;
  const put = (
    tool: ResourceTool,
    setting: ToolSetting | undefined,
    section: ResourceSection | null,
  ) => {
    const key = section?.jobRole?.id ?? 'everyone';
    const variant = section ? tool.variantFor?.(section.jobRole) : undefined;
    placed.set(key, [
      ...(placed.get(key) ?? []),
      {
        ...tool,
        title: variant?.title ?? tool.title,
        href: variant?.to ?? tool.to,
        setting,
        usable: setting ? canUseTool(employee, tool.key) : true,
      },
    ]);
  };
  for (const tool of RESOURCE_TOOLS) {
    const setting = settings.find((entry) => entry.key === tool.key);
    if (!setting) continue;
    if (!canUseTool(employee, tool.key) && !isManager(employee)) continue;
    if (setting.everyone) {
      put(tool, setting, null);
      continue;
    }
    const homes = sections.filter(
      (section) => section.jobRole && setting.jobRoleIds.includes(section.jobRole.id),
    );
    if (homes.length) homes.forEach((section) => put(tool, setting, section));
    else put(tool, setting, null);
  }
  if (isManager(employee)) {
    const managers = sections.find((section) => /^manager/i.test(section.jobRole?.name ?? ''));
    put(REIMBURSEMENTS, undefined, managers ?? null);
  }
  return placed;
}
