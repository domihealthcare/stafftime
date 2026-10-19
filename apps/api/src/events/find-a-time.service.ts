import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EventAudience,
  EventReplyAnswer,
  PracticeEventKind,
  Prisma,
  PtoStatus,
  ShiftStatus,
} from '@prisma/client';
import { toRule } from '../availability/availability.service';
import {
  addDaysTo,
  localDateIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { FindTimeInput } from './dto/find-time.dto';
import { chosenWhere, WORKING } from './events.service';
import { findTimes, slotsToSearch, TimePerson } from './find-a-time';

/// Two weeks unless asked otherwise.
export const DEFAULT_SEARCH_DAYS = 14;

/// What decides who another meeting is for.
interface MeetingFor {
  audience: EventAudience;
  jobRoleId: string | null;
  locationId: string | null;
  invitees: { employeeId: string | null; jobRoleId: string | null; locationId: string | null }[];
}

/**
 * "Find a time" for a meeting being booked: loads everybody it would be for,
 * with their shifts (drafts too), time off, availability and other meetings,
 * and asks `find-a-time.ts` for the best few times. Reads only; nothing is
 * stored and nobody is told.
 */
@Injectable()
export class FindATimeService {
  constructor(private readonly prisma: PrismaService) {}

  async find(dto: FindTimeInput, now = new Date()) {
    const today = localDateIn(now, PRACTICE_ZONE);
    const from = dto.from < today ? today : dto.from;
    const days = dto.days ?? DEFAULT_SEARCH_DAYS;
    const lastDay = addDaysTo(from, days - 1);
    const start = zonedTimeToUtc(from, '00:00', PRACTICE_ZONE);
    const end = zonedTimeToUtc(addDaysTo(from, days), '00:00', PRACTICE_ZONE);

    const where: Prisma.EmployeeWhereInput =
      dto.audience === EventAudience.CHOSEN
        ? chosenWhere({
            employeeIds: dto.invitees?.employeeIds ?? [],
            jobRoleIds: dto.invitees?.jobRoleIds ?? [],
            locationIds: dto.invitees?.locationIds ?? [],
          })
        : { employmentStatus: WORKING };
    const people = await this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        preferredName: true,
        lastName: true,
        jobRoles: { select: { jobRoleId: true } },
        locations: { select: { locationId: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    if (people.length === 0) {
      throw new BadRequestException('Add who it is for first - nobody is on the list yet.');
    }
    const ids = people.map((person) => person.id);

    // The meeting being changed is not in its own way - nor, for a series,
    // its other dates.
    const editing = dto.eventId
      ? await this.prisma.practiceEvent.findUnique({
          where: { id: dto.eventId },
          select: { id: true, seriesId: true },
        })
      : null;

    const [shifts, timeOff, unavailability, meetings] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          employeeId: { in: ids },
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        select: { employeeId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.ptoRequest.findMany({
        where: {
          employeeId: { in: ids },
          status: { in: [PtoStatus.APPROVED, PtoStatus.PENDING] },
          startDate: { lte: new Date(`${lastDay}T00:00:00Z`) },
          endDate: { gte: new Date(`${from}T00:00:00Z`) },
        },
        select: {
          employeeId: true,
          status: true,
          isHalfDay: true,
          startDate: true,
          endDate: true,
        },
      }),
      this.prisma.unavailability.findMany({
        where: {
          employeeId: { in: ids },
          effectiveFrom: { lte: new Date(`${lastDay}T00:00:00Z`) },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: new Date(`${from}T00:00:00Z`) } },
          ],
        },
      }),
      this.prisma.practiceEvent.findMany({
        where: {
          kind: PracticeEventKind.EVENT,
          startsAt: { lt: end },
          endsAt: { gt: start },
          ...(editing
            ? {
                id: { not: editing.id },
                ...(editing.seriesId
                  ? { OR: [{ seriesId: null }, { seriesId: { not: editing.seriesId } }] }
                  : {}),
              }
            : {}),
        },
        select: {
          title: true,
          allDay: true,
          startsAt: true,
          endsAt: true,
          audience: true,
          jobRoleId: true,
          locationId: true,
          invitees: { select: { employeeId: true, jobRoleId: true, locationId: true } },
          replies: {
            where: { answer: EventReplyAnswer.NOT_GOING },
            select: { employeeId: true },
          },
        },
      }),
    ]);

    const day = (date: Date) => date.toISOString().slice(0, 10);
    const timePeople: TimePerson[] = people.map((person) => {
      const roles = person.jobRoles.map((row) => row.jobRoleId);
      const offices = person.locations.map((row) => row.locationId);
      return {
        id: person.id,
        name: `${person.preferredName ?? person.firstName} ${person.lastName}`,
        shifts: shifts.filter((shift) => shift.employeeId === person.id),
        timeOff: timeOff
          .filter((request) => request.employeeId === person.id)
          .map((request) => ({
            startDate: day(request.startDate),
            endDate: day(request.endDate),
            approved: request.status === PtoStatus.APPROVED,
            halfDay: request.isHalfDay,
          })),
        // An all-day event (a wellness day) is not a meeting that takes up
        // an hour; only timed ones are in the way. Nor is one they said they
        // can't go to.
        meetings: meetings
          .filter(
            (meeting) =>
              !meeting.allDay &&
              isFor(meeting, person.id, roles, offices) &&
              !meeting.replies.some((reply) => reply.employeeId === person.id),
          )
          .map((meeting) => ({
            startsAt: meeting.startsAt,
            endsAt: meeting.endsAt,
            title: meeting.title,
          })),
        rules: unavailability.filter((row) => row.employeeId === person.id).map(toRule),
      };
    });

    const slots = slotsToSearch(from, days, dto.minutes, now, PRACTICE_ZONE);
    return {
      from,
      days,
      people: people.length,
      suggestions: findTimes(slots, timePeople, PRACTICE_ZONE),
    };
  }
}

/// Whether another meeting is for this person - `visibleTo`'s rule.
export function isFor(meeting: MeetingFor, id: string, roles: string[], offices: string[]) {
  switch (meeting.audience) {
    case EventAudience.EVERYONE:
      return true;
    case EventAudience.JOB_ROLE:
      return meeting.jobRoleId !== null && roles.includes(meeting.jobRoleId);
    case EventAudience.LOCATION:
      return meeting.locationId !== null && offices.includes(meeting.locationId);
    case EventAudience.CHOSEN:
      return meeting.invitees.some(
        (invitee) =>
          invitee.employeeId === id ||
          (invitee.jobRoleId !== null && roles.includes(invitee.jobRoleId)) ||
          (invitee.locationId !== null && offices.includes(invitee.locationId)),
      );
    default:
      return false;
  }
}
