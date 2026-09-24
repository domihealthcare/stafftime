import type { PtoRequest, PtoType } from './types';

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

export const PTO_TYPE_LABELS: Record<PtoType, string> = {
  VACATION: 'Vacation',
  SICK: 'Sick',
  PERSONAL: 'Personal',
  BEREAVEMENT: 'Bereavement',
  UNPAID: 'Unpaid',
  OTHER: 'Other',
};
