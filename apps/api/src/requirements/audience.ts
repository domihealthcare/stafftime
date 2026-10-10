import { EmploymentStatus, Prisma } from '@prisma/client';

/// Who counts as staff for a requirement: the same people an event or a
/// survey is for.
export const WORKING: { in: EmploymentStatus[] } = {
  in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE],
};

interface Targeted {
  everyone: boolean;
  targets: { employeeId: string | null; jobRoleId: string | null; locationId: string | null }[];
}

/// The people a requirement is for, as they are today: somebody who joins
/// one of its job roles or offices is asked too, somebody who leaves is not.
export function audienceWhere(row: Targeted): Prisma.EmployeeWhereInput {
  if (row.everyone) return { employmentStatus: WORKING };
  const people = row.targets.flatMap((t) => (t.employeeId ? [t.employeeId] : []));
  const roles = row.targets.flatMap((t) => (t.jobRoleId ? [t.jobRoleId] : []));
  const offices = row.targets.flatMap((t) => (t.locationId ? [t.locationId] : []));
  const any: Prisma.EmployeeWhereInput[] = [];
  if (people.length) any.push({ id: { in: people } });
  if (roles.length) any.push({ jobRoles: { some: { jobRoleId: { in: roles } } } });
  if (offices.length) any.push({ locations: { some: { locationId: { in: offices } } } });
  // Everything on the list since removed leaves nobody, not everybody.
  return { employmentStatus: WORKING, OR: any.length > 0 ? any : [{ id: { in: [] } }] };
}

/// The requirements one person is asked for, given their job roles and offices.
export function forPersonWhere(
  employeeId: string,
  jobRoleIds: string[],
  locationIds: string[],
): Prisma.RequirementWhereInput {
  return {
    OR: [
      { everyone: true },
      {
        targets: {
          some: {
            OR: [
              { employeeId },
              { jobRoleId: { in: jobRoleIds } },
              { locationId: { in: locationIds } },
            ],
          },
        },
      },
    ],
  };
}
