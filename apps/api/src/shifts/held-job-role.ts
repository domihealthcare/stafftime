import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The job role a shift for somebody is for: always one they hold (Dominguez,
 * September 2026 — "I shouldn't have the option to be 'any job role', only the
 * job roles assigned to me"). Open shifts are not held by anybody and keep
 * any role, or none.
 *
 * - A role they hold is used as asked.
 * - A role they do not hold is refused, by name, so the manager knows to add
 *   them to it on Staff first.
 * - No role at all: with one role, that one; with several, they are asked to
 *   choose; with none yet, the shift has none.
 */
export async function heldJobRole(
  prisma: PrismaService,
  employeeId: string,
  jobRoleId: string | null | undefined,
): Promise<string | null> {
  const held = await prisma.employeeJobRole.findMany({
    where: { employeeId },
    select: { jobRole: { select: { id: true, name: true } } },
    orderBy: { jobRole: { sortOrder: 'asc' } },
  });
  const roles = held.map((row) => row.jobRole);

  if (jobRoleId) {
    if (roles.some((role) => role.id === jobRoleId)) return jobRoleId;
    const asked = await prisma.jobRole.findUnique({
      where: { id: jobRoleId },
      select: { name: true },
    });
    if (!asked) throw new BadRequestException('That job role does not exist.');
    throw new BadRequestException(
      roles.length === 0
        ? `They are not in ${asked.name}, and have no job role yet. Add them to one on Staff first.`
        : `They are not in ${asked.name}. Choose one of theirs (${names(roles)}), or add them to ${asked.name} on Staff first.`,
    );
  }

  if (roles.length === 0) return null;
  if (roles.length === 1) return roles[0].id;
  throw new BadRequestException(`Say which of their job roles it is for: ${names(roles)}.`);
}

function names(roles: { name: string }[]): string {
  const list = roles.map((role) => role.name);
  return list.length <= 1
    ? (list[0] ?? '')
    : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
}
