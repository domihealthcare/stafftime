import { ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Takes shifts off a person for their approved time off: taken off the rota
 * (a draft deleted, a published one cancelled), or left as open shifts for
 * somebody else to cover - same office, hours, job role and note, no longer
 * theirs, and no longer part of their regular shift. Shared by "all their
 * shifts in those days" and the per-shift choices of a provider's day off.
 */
export async function applyShiftChoice(
  prisma: Pick<PrismaService, 'shift' | '$transaction'>,
  shifts: { id: string; status: string }[],
  choice: 'REMOVE' | 'OPEN',
): Promise<void> {
  if (shifts.length === 0) return;
  const ids = shifts.map((shift) => shift.id);
  if (choice === 'OPEN') {
    await prisma.shift.updateMany({
      where: { id: { in: ids } },
      data: { employeeId: null, seriesId: null },
    });
    return;
  }
  const drafts = shifts.filter((shift) => shift.status === ShiftStatus.DRAFT);
  await prisma.$transaction([
    prisma.shift.deleteMany({ where: { id: { in: drafts.map((shift) => shift.id) } } }),
    prisma.shift.updateMany({
      where: { id: { in: ids }, status: { not: ShiftStatus.DRAFT } },
      data: { status: ShiftStatus.CANCELLED },
    }),
  ]);
}
