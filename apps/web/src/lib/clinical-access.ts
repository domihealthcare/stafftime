import type { Employee } from './types';

/// The 99483 cognitive assessment: providers only — people whose job role
/// uses the clinical forms. Access level brings nothing.
export function canUseCognitiveAssessment(employee: Employee): boolean {
  return employee.usesClinicalForms === true;
}

/// The care plan (CCM and APCM): providers, and managers and admins too (Dominguez,
/// October 2026).
export function canUseCarePlan(employee: Employee): boolean {
  return (
    employee.usesClinicalForms === true || employee.role === 'MANAGER' || employee.role === 'ADMIN'
  );
}

/// The Annual Wellness Visit form: people whose job role has it (Providers and
/// Medical Assistants), and managers and admins, like the care plan (October 2026).
export function canUseWellnessForm(employee: Employee): boolean {
  return (
    employee.usesWellnessForm === true || employee.role === 'MANAGER' || employee.role === 'ADMIN'
  );
}

/// Which page of the wellness form somebody starts on: a provider (a job role
/// with the clinical forms) the questionnaire, page 1; everybody else — the
/// Medical Assistants — the preventive services, page 2.
export function wellnessStartPage(employee: Employee): 1 | 2 {
  return employee.usesClinicalForms === true ? 1 : 2;
}
