import { Prisma, PtoStatus, PtoType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PastBalanceSplit } from './past-balance-split';

/**
 * The writes that turn one request into its split (November 2026), shared by
 * approving one past the balance and by putting right one approved before the
 * split existed. The request keeps its first stretch; each later stretch is a
 * request of its own, approved with it and pointing back to it
 * (`splitFromId`), so cancelling any of them cancels them all. An unpaid
 * stretch is Unpaid and says which balance it went past
 * (`unpaidPastBalanceOf`); a paid one, which only happens after an unpaid one
 * across the turn of the year, keeps the kind asked for.
 */
export function splitWrites(
  prisma: PrismaService,
  request: { id: string; employeeId: string; type: PtoType },
  split: PastBalanceSplit,
  options: {
    /// Extra conditions the request must still meet, so a request decided or
    /// changed meanwhile is left alone (the write then fails with P2025).
    where: Prisma.PtoRequestWhereInput;
    /// Anything else to write on the request itself (the decision).
    data?: Prisma.PtoRequestUpdateInput;
    reviewedById: string;
    reviewedAt: Date;
  },
): Prisma.PrismaPromise<{ id: string }>[] {
  const [first, ...rest] = split.segments;
  const unpaid = (paid: boolean) =>
    paid ? {} : { type: PtoType.UNPAID, unpaidPastBalanceOf: request.type, pastBalance: false };
  return [
    prisma.ptoRequest.update({
      where: { ...options.where, id: request.id } as Prisma.PtoRequestWhereUniqueInput,
      data: {
        ...options.data,
        startDate: first.startDate,
        endDate: first.endDate,
        ...unpaid(first.paid),
      },
      select: { id: true },
    }),
    ...rest.map((segment) =>
      prisma.ptoRequest.create({
        data: {
          employeeId: request.employeeId,
          type: segment.paid ? request.type : PtoType.UNPAID,
          status: PtoStatus.APPROVED,
          startDate: segment.startDate,
          endDate: segment.endDate,
          isHalfDay: segment.isHalfDay,
          reviewedById: options.reviewedById,
          reviewedAt: options.reviewedAt,
          splitFromId: request.id,
          unpaidPastBalanceOf: segment.paid ? null : request.type,
        },
        select: { id: true },
      }),
    ),
  ];
}
