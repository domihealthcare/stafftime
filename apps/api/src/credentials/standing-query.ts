import { EmploymentStatus } from '@prisma/client';
import { practiceToday } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { StandingLine, standingFor } from './standing';

export type { StandingLine };

/**
 * Each person against the licenses their job roles ask for — one person, or
 * everybody still employed who is asked for anything. One query, shared by
 * the Licenses screen, the nightly round-up and the Dashboard, so they cannot
 * disagree.
 */
export async function loadStanding(prisma: PrismaService, only?: string) {
  const people = await prisma.employee.findMany({
    where: {
      ...(only ? { id: only } : { employmentStatus: { not: EmploymentStatus.TERMINATED } }),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      jobRoles: {
        select: {
          jobRole: {
            select: {
              name: true,
              credentialRequirements: {
                where: { credentialType: { archivedAt: null } },
                select: {
                  credentialTypeId: true,
                  required: true,
                  credentialType: {
                    select: {
                      id: true,
                      name: true,
                      kind: true,
                      renewalMonths: true,
                      sortOrder: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      credentials: {
        where: { archivedAt: null },
        select: { id: true, name: true, credentialTypeId: true, expiresOn: true },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const today = practiceToday();
  return people
    .map((person) => ({
      employee: {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        preferredName: person.preferredName,
      },
      lines: standingFor(
        person.jobRoles.flatMap(({ jobRole }) =>
          jobRole.credentialRequirements.map((requirement) => ({
            credentialTypeId: requirement.credentialTypeId,
            required: requirement.required,
            jobRoleName: jobRole.name,
            type: requirement.credentialType,
          })),
        ),
        person.credentials,
        today,
      ),
    }))
    .filter((person) => only || person.lines.length > 0);
}
