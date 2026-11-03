import { StudentKind } from '@prisma/client';

/// What each kind of student is called on screen and under the bell.
export const STUDENT_KIND_LABEL: Record<StudentKind, string> = {
  MEDICAL_STUDENT: 'Medical student',
  RESIDENT: 'Resident',
  NP_STUDENT: 'NP student',
  PA_STUDENT: 'PA student',
  NURSING_STUDENT: 'Nursing student',
  OTHER: 'Student',
};

/// "Medical student, Rutgers NJMS" - or just "Resident" with no school.
export function describeStudent(student: { kind: StudentKind; school: string | null }): string {
  const kind = STUDENT_KIND_LABEL[student.kind];
  return student.school ? `${kind}, ${student.school}` : kind;
}

/// How a provider is named beside a student: "Dr. Jose Badia" for a doctor,
/// otherwise their name as it is used.
export function providerName(person: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  postNominals: string | null;
}): string {
  const name = `${(person.preferredName ?? person.firstName).trim()} ${person.lastName.trim()}`;
  return person.postNominals && /\b(MD|DO)\b/i.test(person.postNominals) ? `Dr. ${name}` : name;
}
