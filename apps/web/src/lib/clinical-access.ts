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
