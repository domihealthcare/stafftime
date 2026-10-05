import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Somebody's main job role (October 2026, Dominguez): one of the roles they
 * hold, marked `isPrimary`. Whoever holds any role has exactly one — the
 * migration's partial unique index stops a second, and this stops none, by
 * handing the flag to their first role in the practice's order whenever they
 * are left without one (their first role added, their main one taken away,
 * a job role deleted).
 */
export async function ensureMainJobRole(db: Db, employeeIds: string[]): Promise<void> {
  for (const employeeId of new Set(employeeIds)) {
    const held = await db.employeeJobRole.findMany({
      where: { employeeId },
      select: { jobRoleId: true, isPrimary: true },
      orderBy: [{ jobRole: { sortOrder: 'asc' } }, { jobRole: { name: 'asc' } }],
    });
    if (held.length === 0 || held.some((row) => row.isPrimary)) continue;
    await db.employeeJobRole.update({
      where: { employeeId_jobRoleId: { employeeId, jobRoleId: held[0].jobRoleId } },
      data: { isPrimary: true },
    });
  }
}

/// Makes one of somebody's roles their main one, taking the flag off the old
/// one first so the index never sees two.
export async function setMainJobRole(db: PrismaClient, employeeId: string, jobRoleId: string) {
  await db.$transaction([
    db.employeeJobRole.updateMany({
      where: { employeeId, isPrimary: true, jobRoleId: { not: jobRoleId } },
      data: { isPrimary: false },
    }),
    db.employeeJobRole.update({
      where: { employeeId_jobRoleId: { employeeId, jobRoleId } },
      data: { isPrimary: true },
    }),
  ]);
}

/// Somebody's roles with the main one first, then the practice's order.
export function mainFirst<T extends { isPrimary: boolean; sortOrder: number; name: string }>(
  roles: T[],
): T[] {
  return [...roles].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name),
  );
}
