import { Role } from '@prisma/client';

/**
 * The forms and guides built into Domi Staff whose users managers choose
 * (October 2026, Dominguez: "there should be an option for managers ... to
 * make the form available for either one group or multiple groups of job
 * roles"). Pure, so the rules are tested on their own.
 *
 * Each is for everyone, or for the job roles chosen (ToolAccess). Until a
 * manager chooses, it keeps the default below, which is how it was before.
 * Managers and admins can always open a tool, to see what they are handing
 * out, except the BrainCheck Care Plan: its note is signed by whoever fills
 * it in as the provider, so only the job roles chosen use it.
 */

export interface DefaultRole {
  name: string;
  usesClinicalForms: boolean;
  usesWellnessForm: boolean;
}

export interface ToolInfo {
  key: string;
  label: string;
  managersAlways: boolean;
  /// The default: everyone, or the job roles that fit.
  defaults: 'everyone' | ((role: DefaultRole) => boolean);
}

const providers = (role: DefaultRole) => role.usesClinicalForms;
const wellness = (role: DefaultRole) => role.usesWellnessForm;

export const TOOLS: ToolInfo[] = [
  { key: 'phone-book', label: 'Phone book', managersAlways: true, defaults: 'everyone' },
  { key: 'diagnostics', label: 'Diagnostics', managersAlways: true, defaults: 'everyone' },
  {
    key: 'front-desk',
    label: 'Front desk guide',
    managersAlways: true,
    defaults: (role) => /front\s*desk/i.test(role.name),
  },
  { key: 'braincheck', label: 'BrainCheck Care Plan', managersAlways: false, defaults: providers },
  // Dominguez, 20 October 2026: "APCM Care Plan should be Medical Assistant"
  // (and providers, who had it).
  { key: 'apcm', label: 'APCM Care Plan', managersAlways: true, defaults: wellness },
  { key: 'wellness', label: 'Annual Wellness Visit', managersAlways: true, defaults: wellness },
  {
    key: 'results-playbook',
    label: 'Results playbook',
    managersAlways: true,
    defaults: providers,
  },
  { key: 'inpatient-notes', label: 'Inpatient notes', managersAlways: true, defaults: providers },
];

export const TOOL_KEYS = TOOLS.map((tool) => tool.key);

export interface ToolSetting {
  key: string;
  everyone: boolean;
  jobRoleIds: string[];
}

/// Whether somebody may open a tool, given its setting, their access level
/// and the job roles they hold.
export function mayUse(
  tool: ToolInfo,
  setting: ToolSetting,
  role: Role,
  heldRoleIds: string[],
): boolean {
  if (setting.everyone) return true;
  if (tool.managersAlways && (role === Role.MANAGER || role === Role.ADMIN)) return true;
  return setting.jobRoleIds.some((id) => heldRoleIds.includes(id));
}
