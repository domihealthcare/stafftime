import { Injectable } from '@nestjs/common';
import { PtoStatus, PtoType } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { notCleanBecause } from './clean-time-off';
import { PtoPolicyService } from './pto-policy.service';
import { PtoService } from './pto.service';

/**
 * "Approve the clean time off" - see `clean-time-off.ts`. The Schedule and
 * the Time off screen ask which waiting requests are clean; the button then
 * sends those ids, and each is checked again here before it is approved
 * through the ordinary review (so the person is told as usual). A request
 * that changed in between - a shift added, another request approved - is
 * left for a look.
 */
@Injectable()
export class CleanTimeOffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pto: PtoService,
    private readonly policy: PtoPolicyService,
  ) {}

  /// Every waiting request but the manager's own, clean or with why not.
  async check(actor: AuthUser, now = new Date()) {
    const requests = await this.prisma.ptoRequest.findMany({
      where: { status: PtoStatus.PENDING, employeeId: { not: actor.id } },
      select: { id: true, type: true, employeeId: true, startDate: true },
      orderBy: { startDate: 'asc' },
    });
    return Promise.all(
      requests.map(async (request) => {
        const [balance, clashes, shifts] = await Promise.all([
          this.policy.balanceOn(request.employeeId, request.startDate),
          this.pto.clashes(request.id),
          this.pto.conflictingShifts(request.id),
        ]);
        const remaining =
          request.type === PtoType.VACATION
            ? balance.vacation.remaining
            : request.type === PtoType.SICK
              ? balance.sick.remaining
              : null;
        const why = notCleanBecause({
          type: request.type,
          remaining,
          clashes: clashes.length,
          shifts: shifts.filter((shift) => shift.endsAt > now).length,
        });
        return { id: request.id, clean: why === null, why };
      }),
    );
  }

  /// Approves those of `ids` that are still clean; says how many, and which
  /// were left.
  async approve(ids: string[], actor: AuthUser) {
    const wanted = new Set(ids);
    const checked = (await this.check(actor)).filter((row) => wanted.has(row.id));
    let approved = 0;
    const left: string[] = [];
    for (const row of checked) {
      if (!row.clean) {
        left.push(row.id);
        continue;
      }
      try {
        await this.pto.review(row.id, { decision: PtoStatus.APPROVED }, actor);
        approved += 1;
      } catch {
        // Decided by somebody else in the meantime.
        left.push(row.id);
      }
    }
    return { approved, left };
  }
}
