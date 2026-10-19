import { EmploymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/// The managers and admins who work at an office - told when somebody there
/// is running late or has not turned up. Nobody at that office: every manager
/// and admin, so it reaches somebody. Never the person it is about.
export async function officeManagers(
  prisma: PrismaService,
  locationId: string,
  exceptId: string,
): Promise<string[]> {
  const base = {
    role: { in: [Role.MANAGER, Role.ADMIN] },
    employmentStatus: EmploymentStatus.ACTIVE,
    id: { not: exceptId },
  };
  const here = await prisma.employee.findMany({
    where: { ...base, locations: { some: { locationId } } },
    select: { id: true },
  });
  if (here.length > 0) return here.map((person) => person.id);
  const everyone = await prisma.employee.findMany({ where: base, select: { id: true } });
  return everyone.map((person) => person.id);
}
