import { HttpException, Injectable, Logger } from '@nestjs/common';
import { PtoStatus, PtoType } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';
import { notCleanBecause } from './clean-time-off';
import { PtoPolicyService } from './pto-policy.service';
import { PtoService } from './pto.service';
import { clashesIn, readClashFacts } from './time-off-clashes';

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
  private readonly logger = new Logger(CleanTimeOffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pto: PtoService,
    private readonly policy: PtoPolicyService,
  ) {}

  /// Every waiting request but the manager's own, clean or with why not.
  ///
  /// Each request's balance, clashes and shifts are what `balanceOn`,
  /// `PtoService.clashes` and `PtoService.conflictingShifts` give for it,
  /// worked out from reads made once for all of them rather than about a dozen
  /// for each (maintenance pass, October 2026); `clean-time-off-batch.spec.ts`
  /// holds the two ways equal.
  async check(actor: AuthUser, now = new Date()) {
    const requests = await this.prisma.ptoRequest.findMany({
      where: { status: PtoStatus.PENDING, employeeId: { not: actor.id } },
      select: { id: true, type: true, employeeId: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });
    if (requests.length === 0) return [];
    const [balances, facts, shifts] = await Promise.all([
      this.policy.balancesOn(
        requests.map((request) => ({ employeeId: request.employeeId, day: request.startDate })),
      ),
      readClashFacts(
        this.prisma,
        requests.map((request) => ({
          from: isoDate(request.startDate),
          to: isoDate(request.endDate),
        })),
      ),
      this.pto.conflictingShiftsFor(requests),
    ]);
    return requests.map((request, index) => {
      const balance = balances[index];
      const clashes = clashesIn(facts, isoDate(request.startDate), isoDate(request.endDate), {
        employeeId: request.employeeId,
      });
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
        shifts: shifts[index].filter((shift) => shift.endsAt > now).length,
      });
      return { id: request.id, clean: why === null, why };
    });
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
      } catch (cause) {
        // Usually decided by somebody else in the meantime, which the review
        // refuses with a 4xx. Anything else (the database, a bug) is logged.
        if (!(cause instanceof HttpException)) {
          this.logger.warn(`Could not approve time off ${row.id}: ${String(cause)}`);
        }
        left.push(row.id);
      }
    }
    return { approved, left };
  }
}
