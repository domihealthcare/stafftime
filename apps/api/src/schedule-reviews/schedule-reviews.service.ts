import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import {
  addDaysTo,
  datesBetween,
  localDateIn,
  PRACTICE_ZONE,
} from '../common/util/zoned-time.util';
import { named, PERSON, PROVIDER, WORKING } from '../on-call/on-call.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ScheduleReviewAreasInput,
  ScheduleReviewDayInput,
  ScheduleReviewPatternInput,
} from './dto/schedule-reviews.dto';
import { reviewOn, reviewRules } from './schedule-reviews';

/// The most a screen asks for at once.
const MAX_DAYS = 31;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Who reviews which provider's patient schedule (October 2026, Dominguez).
 * The rules are in `schedule-reviews.ts`; this reads and writes them.
 * Everybody signed in reads it - the point is that others know whose
 * schedule is being reviewed; managers and admins change it. Anybody still
 * here can be a reviewer (admins, managers or staff); the schedules are those
 * of people in a provider job role, as for on call.
 */
@Injectable()
export class ScheduleReviewsService {
  private readonly logger = new Logger(ScheduleReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Day by day, every provider's reviewer, from one date to another.
  async days(from: string, to: string) {
    if (!DATE_ONLY.test(from ?? '') || !DATE_ONLY.test(to ?? '') || to < from) {
      throw new BadRequestException(
        'Give the days as from and to, the first no later than the last.',
      );
    }
    if (addDaysTo(from, MAX_DAYS - 1) < to) {
      throw new BadRequestException(`At most ${MAX_DAYS} days at a time.`);
    }
    const [providers, rules] = await Promise.all([this.providers(), this.rules(from, to)]);
    const reviewerIds = new Set<string>();
    const days = datesBetween(from, to).map((date) => ({
      date,
      reviews: providers.map((provider) => {
        const review = reviewOn(date, provider.id, rules);
        if (review.reviewerId) reviewerIds.add(review.reviewerId);
        return review;
      }),
    }));
    const people = await this.people([...reviewerIds]);
    return {
      providers,
      days: days.map((day) => ({
        date: day.date,
        reviews: day.reviews.map((review) => ({
          providerId: review.providerId,
          reviewer: review.reviewerId ? (people.get(review.reviewerId) ?? null) : null,
          source: review.source,
          note: review.note,
        })),
      })),
    };
  }

  /// The usual pattern, with who can be picked.
  async pattern() {
    const [providers, rows, reviewers] = await Promise.all([
      this.providers(),
      this.prisma.scheduleReviewer.findMany({
        where: { provider: PROVIDER, reviewer: { employmentStatus: { in: WORKING } } },
        select: { providerId: true, weekday: true, reviewerId: true },
        orderBy: [{ providerId: 'asc' }, { weekday: 'asc' }],
      }),
      this.prisma.employee.findMany({
        where: { employmentStatus: { in: WORKING } },
        select: PERSON,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);
    return { providers, entries: rows, reviewers: reviewers.map(named) };
  }

  /// The whole usual pattern, replacing what was there.
  async savePattern(dto: ScheduleReviewPatternInput, actor: AuthUser) {
    const keys = new Set<string>();
    for (const entry of dto.entries) {
      const key = `${entry.providerId}|${entry.weekday}`;
      if (keys.has(key)) {
        throw new BadRequestException('Each provider’s schedule has one reviewer a day.');
      }
      keys.add(key);
    }
    await this.assertProviders(dto.entries.map((entry) => entry.providerId));
    await this.assertReviewers(dto.entries.map((entry) => entry.reviewerId));
    await this.prisma.$transaction([
      this.prisma.scheduleReviewer.deleteMany({}),
      this.prisma.scheduleReviewer.createMany({ data: dto.entries }),
    ]);
    this.logger.log(`Schedule review pattern saved by ${actor.id}`);
    return this.pattern();
  }

  /// The groups of schedules and who reviews each, in order, with who can be
  /// picked (for managers).
  async areas() {
    const [rows, reviewers] = await Promise.all([
      this.prisma.scheduleReviewArea.findMany({
        select: { id: true, name: true, reviewerId: true, forResources: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.employee.findMany({
        where: { employmentStatus: { in: WORKING } },
        select: PERSON,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);
    const people = await this.people(
      rows.flatMap((row) => (row.reviewerId ? [row.reviewerId] : [])),
    );
    return {
      areas: rows.map((row) => ({
        id: row.id,
        name: row.name,
        forResources: row.forResources,
        // Somebody who has left counts as nobody, as for the usual pattern.
        reviewer: row.reviewerId ? (people.get(row.reviewerId) ?? null) : null,
      })),
      reviewers: reviewers.map(named),
    };
  }

  /// The whole list, replacing what was there; a group keeps its id when
  /// it is sent back with one.
  async saveAreas(dto: ScheduleReviewAreasInput, actor: AuthUser) {
    const names = dto.areas.map((area) => area.name.trim());
    if (names.some((name) => !name)) {
      throw new BadRequestException('Every group needs a name.');
    }
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
      throw new BadRequestException('Each group needs its own name.');
    }
    await this.assertReviewers(
      dto.areas.flatMap((area) => (area.reviewerId ? [area.reviewerId] : [])),
    );
    await this.prisma.$transaction([
      this.prisma.scheduleReviewArea.deleteMany({}),
      this.prisma.scheduleReviewArea.createMany({
        data: dto.areas.map((area, index) => ({
          name: names[index],
          sortOrder: index + 1,
          reviewerId: area.reviewerId ?? null,
          forResources: area.forResources ?? false,
        })),
      }),
    ]);
    this.logger.log(`Schedule review groups saved by ${actor.id}`);
    return this.areas();
  }

  /// One provider's schedule on one date: somebody else, or nobody. Today
  /// or later - who reviewed before stays as it was.
  async setDay(
    date: string,
    providerId: string,
    dto: ScheduleReviewDayInput,
    actor: AuthUser,
    now = new Date(),
  ) {
    this.assertNotPast(date, now);
    await this.assertProviders([providerId]);
    const reviewerId = dto.reviewerId ?? null;
    if (reviewerId) await this.assertReviewers([reviewerId]);
    const note = dto.note?.trim() || null;
    const key = { date_providerId: { date: toUtcDate(date), providerId } };
    await this.prisma.scheduleReviewDay.upsert({
      where: key,
      create: { date: toUtcDate(date), providerId, reviewerId, note, setById: actor.id },
      update: { reviewerId, note, setById: actor.id },
    });
    return this.days(date, date);
  }

  /// Back to the usual pattern for that day.
  async clearDay(date: string, providerId: string, now = new Date()) {
    this.assertNotPast(date, now);
    await this.prisma.scheduleReviewDay.deleteMany({
      where: { date: toUtcDate(date), providerId },
    });
    return this.days(date, date);
  }

  // ---------------------------------------------------------------- helpers

  private assertNotPast(date: string, now: Date) {
    if (!DATE_ONLY.test(date)) throw new BadRequestException('Give the day as a date.');
    if (date < localDateIn(now, PRACTICE_ZONE)) {
      throw new BadRequestException(
        'Change today or a later day - who reviewed before stays as it was.',
      );
    }
  }

  private async assertProviders(ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await this.prisma.employee.count({ where: { id: { in: unique }, ...PROVIDER } });
    if (count !== unique.length) {
      throw new BadRequestException('Only a provider’s schedule can be reviewed here.');
    }
  }

  private async assertReviewers(ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await this.prisma.employee.count({
      where: { id: { in: unique }, employmentStatus: { in: WORKING } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('A reviewer has to be somebody still here.');
    }
  }

  private async providers() {
    const rows = await this.prisma.employee.findMany({
      where: PROVIDER,
      select: PERSON,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map(named);
  }

  private async rules(from: string, to: string) {
    const [usual, changed, present] = await Promise.all([
      this.prisma.scheduleReviewer.findMany({
        select: { providerId: true, weekday: true, reviewerId: true },
      }),
      this.prisma.scheduleReviewDay.findMany({
        where: { date: { gte: toUtcDate(from), lte: toUtcDate(to) } },
        select: { date: true, providerId: true, reviewerId: true, note: true },
      }),
      this.prisma.employee.findMany({
        where: { employmentStatus: { in: WORKING } },
        select: { id: true },
      }),
    ]);
    return reviewRules(
      usual,
      changed.map((row) => ({ ...row, date: isoDate(row.date) })),
      present.map((row) => row.id),
    );
  }

  private async people(ids: string[]) {
    const rows = ids.length
      ? await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: PERSON })
      : [];
    return new Map(rows.map((row) => [row.id, named(row)]));
  }
}
