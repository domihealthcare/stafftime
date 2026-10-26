import { PrismaService } from '../prisma/prisma.service';
import { isoDate } from '../common/util/calendar-date.util';
import { checkLines, downtimeLines, officesWords } from './downtime';

/**
 * The Downtime part of the nightly email, and the banner on the Downtime page
 * (October 2026): a downtime left open, a catch-up past its day, paper that
 * can be shredded, and what the monthly check found that no manager has read
 * yet. One read for both, like the rest of the round-up.
 */
export async function loadDowntimeLines(
  prisma: Pick<PrismaService, 'downtime' | 'downtimeCheck' | 'location'>,
  now = new Date(),
): Promise<string[]> {
  const [downtimes, checks, officeCount] = await Promise.all([
    prisma.downtime.findMany({
      where: {
        OR: [
          { announcedAt: { not: null }, endedAt: null },
          { endedAt: { not: null }, OR: [{ caughtUpAt: null }, { shreddedAt: null }] },
        ],
      },
      select: {
        systems: true,
        startsAt: true,
        announcedAt: true,
        endedAt: true,
        catchUpDueOn: true,
        caughtUpAt: true,
        shreddedAt: true,
        locations: { select: { location: { select: { name: true } } } },
      },
      orderBy: { startsAt: 'asc' },
      take: 30,
    }),
    prisma.downtimeCheck.findMany({
      where: { readAt: null, OR: [{ feedback: { not: null } }, { lowItems: { isEmpty: false } }] },
      select: {
        lowItems: true,
        feedback: true,
        location: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true, preferredName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    prisma.location.count(),
  ]);
  return [
    ...downtimeLines(
      downtimes.map((row) => ({
        systems: row.systems,
        offices: officesWords(
          row.locations.map((entry) => entry.location.name),
          officeCount,
        ),
        startsAt: row.startsAt,
        announcedAt: row.announcedAt,
        endedAt: row.endedAt,
        catchUpDueOn: row.catchUpDueOn ? isoDate(row.catchUpDueOn) : null,
        caughtUpAt: row.caughtUpAt,
        shreddedAt: row.shreddedAt,
      })),
      now,
    ),
    ...checkLines(
      checks.map((row) => ({
        office: row.location?.name ?? null,
        who: row.employee
          ? `${row.employee.preferredName ?? row.employee.firstName} ${row.employee.lastName.charAt(0)}`
          : 'Somebody',
        lowItems: row.lowItems,
        feedback: row.feedback,
      })),
    ),
  ];
}
