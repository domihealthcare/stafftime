import type { AllowanceBalance, PtoRequest, PtoType } from './types';

/// What a rota shows for a day somebody is off: approved time off blocks the
/// day, a request still waiting on a manager is a warning. Denied and
/// withdrawn requests are nothing at all.
export function timeOffOn(
  requests: PtoRequest[],
  employeeId: string | null | undefined,
  date: string,
): PtoRequest | null {
  if (!employeeId) return null;
  const matching = requests.filter(
    (request) =>
      request.employeeId === employeeId &&
      (request.status === 'APPROVED' || request.status === 'PENDING') &&
      request.startDate.slice(0, 10) <= date &&
      request.endDate.slice(0, 10) >= date,
  );
  // Approved wins: a day that is both booked off and asked about is off.
  return matching.find((request) => request.status === 'APPROVED') ?? matching[0] ?? null;
}

/// VACATION is shown as "PTO", the practice's word for it and the name of its
/// allowance. The last four are only for requests made before September 2026,
/// when the form offered them; a new request is Sick or PTO (Dominguez).
export const PTO_TYPE_LABELS: Record<PtoType, string> = {
  VACATION: 'PTO',
  SICK: 'Sick',
  PERSONAL: 'Personal',
  BEREAVEMENT: 'Bereavement',
  UNPAID: 'Unpaid',
  OTHER: 'Other',
};

/// What a new request can be, in the order the form offers them.
export const REQUESTABLE_PTO_TYPES = ['SICK', 'VACATION'] as const satisfies readonly PtoType[];

/// Nothing to have, nothing taken and nothing asked for: somebody who does
/// not get this kind of time off (Dominguez, October 2026: "not all employees
/// have PTO").
export function hasNone(allowance: AllowanceBalance): boolean {
  return allowance.available === 0 && allowance.used === 0 && allowance.pending === 0;
}
