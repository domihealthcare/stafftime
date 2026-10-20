import type { Employee } from './types';

/**
 * Who may open each built-in form or guide. Managers choose, on Resources, for
 * everyone or for one or more job roles (October 2026, Dominguez); the server
 * works it out and sends the signed-in person's list as `tools` (see the API's
 * `tool-access/`). These read that list.
 */
export function canUseTool(employee: Employee, key: string): boolean {
  return employee.tools?.includes(key) === true;
}

/// The BrainCheck Care Plan (CPT 99483): the job roles chosen, which start as
/// the providers'. Unlike the rest, managers and admins do not get it by their
/// access level: its note is signed by whoever fills it in as the provider.
export function canUseCognitiveAssessment(employee: Employee): boolean {
  return canUseTool(employee, 'braincheck');
}

/// The APCM (and CCM) Care Plan: the job roles chosen, starting with medical
/// assistants and providers, and managers and admins.
export function canUseCarePlan(employee: Employee): boolean {
  return canUseTool(employee, 'apcm');
}

/// The Annual Wellness Visit form: the job roles chosen, starting with
/// providers and medical assistants, and managers and admins.
export function canUseWellnessForm(employee: Employee): boolean {
  return canUseTool(employee, 'wellness');
}

/// Which page of the wellness form somebody starts on: a provider (a job role
/// with the clinical forms) the questionnaire, page 1; everybody else - the
/// Medical Assistants - the preventive services, page 2.
export function wellnessStartPage(employee: Employee): 1 | 2 {
  return employee.usesClinicalForms === true ? 1 : 2;
}
