import type Anthropic from '@anthropic-ai/sdk';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import {
  addDaysTo,
  localDateIn,
  localTimeIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';

/**
 * What "Ask Domi Staff" can look up (October 2026, Dominguez — the AI half of
 * making the app smarter). Every tool answers **as the person asking**, by the
 * same rules as the screens: staff see their own shifts and time off, the
 * practice calendar meant for them and the Directory; managers and admins also
 * see the rota, time off requests and what needs a look. A tool that is not
 * theirs is not offered — and refused if asked for anyway.
 *
 * Nothing here reaches patient details, the suggestion box, survey answers,
 * staff profiles (address, pay), licenses or punch locations: those are never
 * sent to an outside service.
 *
 * Pure apart from `AssistantSources`, which the service fills from the
 * existing services, so the gating and the wording can be tested alone.
 */

export const MAX_RANGE_DAYS = 62;

export type ToolName =
  | 'my_schedule'
  | 'my_time_off'
  | 'practice_calendar'
  | 'pay_days'
  | 'directory'
  | 'rota'
  | 'time_off_requests'
  | 'needs_attention';

const RANGE_SCHEMA = {
  type: 'object' as const,
  properties: {
    from: { type: 'string', description: 'First day, YYYY-MM-DD (New Jersey).' },
    to: { type: 'string', description: 'Last day, YYYY-MM-DD, included. At most 62 days on.' },
  },
  required: ['from', 'to'],
  additionalProperties: false,
};

const EVERYONE: Anthropic.Beta.BetaTool[] = [
  {
    name: 'my_schedule',
    description:
      "The asker's own published shifts between two dates: day, hours, office or working from home, job role and any note.",
    input_schema: RANGE_SCHEMA,
  },
  {
    name: 'my_time_off',
    description:
      "The asker's own time off: PTO and sick days left this year, and their requests (approved, waiting or declined) from today on.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'practice_calendar',
    description:
      'Practice events, closures, holidays, diagnostics days and rep lunches the asker can see, between two dates.',
    input_schema: RANGE_SCHEMA,
  },
  {
    name: 'pay_days',
    description: 'Pay days between two dates.',
    input_schema: RANGE_SCHEMA,
  },
  {
    name: 'directory',
    description:
      'The staff directory as the asker sees it: name, pronouns, job roles, offices, work email and phone, whether they are in now (and where) or on leave, and anybody working from home today. Optionally narrowed by part of a name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Part of a name, optional.' } },
      additionalProperties: false,
    },
  },
];

const MANAGERS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'rota',
    description:
      "Everybody's shifts on one day (published and drafts, and open shifts with nobody on), optionally at one office by name.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD (New Jersey).' },
        office: { type: 'string', description: 'North Bergen or West New York, optional.' },
      },
      required: ['date'],
      additionalProperties: false,
    },
  },
  {
    name: 'time_off_requests',
    description: "Everybody's time off requests still waiting on a decision.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'needs_attention',
    description:
      "What the nightly round-up says needs a manager's look today: missing clock-outs, shifts with no clock-in, hours to approve, lapsing licenses, open shifts, overtime coming, days below the minimum and the rest.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

export function managesStaff(actor: AuthUser): boolean {
  return actor.role === Role.MANAGER || actor.role === Role.ADMIN;
}

export function toolsFor(actor: AuthUser): Anthropic.Beta.BetaTool[] {
  return managesStaff(actor) ? [...EVERYONE, ...MANAGERS] : EVERYONE;
}

/// Where the tools read from — the app's own services, as the asker.
export interface AssistantSources {
  shifts(query: { employeeId?: string; from: Date; to: Date; publishedOnly: boolean }): Promise<
    {
      startsAt: Date;
      endsAt: Date;
      status: string;
      isRemote: boolean;
      notes: string | null;
      employee: { firstName: string; preferredName: string | null; lastName: string } | null;
      location: { name: string };
      jobRole: { name: string } | null;
    }[]
  >;
  balance(employeeId: string): Promise<{
    vacation: { remaining: number; pending: number; available: number };
    sick: { remaining: number; pending: number; available: number };
    yearEnd: string;
  }>;
  timeOff(query: { employeeId?: string; status?: 'PENDING'; from?: string }): Promise<
    {
      type: string;
      status: string;
      startDate: Date | string;
      endDate: Date | string;
      isHalfDay: boolean;
      employee?: { firstName: string; preferredName?: string | null; lastName: string };
    }[]
  >;
  events(
    from: string,
    to: string,
  ): Promise<
    {
      kind: string;
      title: string;
      place: string | null;
      allDay: boolean;
      startsAt: Date | string;
      endsAt: Date | string;
      location?: { name: string } | null;
      atLocation?: { name: string } | null;
      rep?: { name: string; company: string | null } | null;
    }[]
  >;
  payDays(from: string, to: string): Promise<string[]>;
  directory(): Promise<
    {
      firstName: string;
      preferredName: string | null;
      lastName: string;
      pronouns?: string | null;
      email?: string | null;
      phone?: string | null;
      onLeave: boolean;
      jobRoles: { name: string }[];
      locations: { name: string }[];
      onNow: { location: { name: string } | null; remote: boolean } | null;
      homeToday: { startsAt: Date; endsAt: Date } | null;
    }[]
  >;
  attention(): Promise<Record<string, string[]>>;
}

export class ToolRefused extends Error {}

/// Runs one tool for the asker and returns what goes back to the model, as
/// compact JSON. A refusal or a bad input comes back as words, flagged as an
/// error, so the model can say so rather than guess.
export async function runTool(
  name: string,
  input: unknown,
  actor: AuthUser,
  sources: AssistantSources,
  now: Date = new Date(),
): Promise<{ content: string; isError: boolean }> {
  try {
    if (!toolsFor(actor).some((tool) => tool.name === name)) {
      throw new ToolRefused(`${name} is not something this person can look up.`);
    }
    const args = (input ?? {}) as Record<string, unknown>;
    const result = await run(name as ToolName, args, actor, sources, now);
    return { content: JSON.stringify(result), isError: false };
  } catch (error) {
    if (error instanceof ToolRefused) return { content: error.message, isError: true };
    throw error;
  }
}

async function run(
  name: ToolName,
  args: Record<string, unknown>,
  actor: AuthUser,
  sources: AssistantSources,
  now: Date,
): Promise<unknown> {
  const today = localDateIn(now, PRACTICE_ZONE);
  switch (name) {
    case 'my_schedule': {
      const { from, to } = range(args);
      const shifts = await sources.shifts({
        // Always their own, whatever was asked for.
        employeeId: actor.id,
        from: zonedTimeToUtc(from, '00:00', PRACTICE_ZONE),
        to: zonedTimeToUtc(addDaysTo(to, 1), '00:00', PRACTICE_ZONE),
        publishedOnly: true,
      });
      return shifts.filter((shift) => shift.status === 'PUBLISHED').map(shiftLine);
    }
    case 'my_time_off': {
      const [balance, requests] = await Promise.all([
        sources.balance(actor.id),
        sources.timeOff({ employeeId: actor.id, from: today }),
      ]);
      return {
        ptoLeft: balance.vacation.remaining,
        ptoWaitingOnADecision: balance.vacation.pending,
        sickLeft: balance.sick.remaining,
        sickWaitingOnADecision: balance.sick.pending,
        yearEnds: balance.yearEnd,
        requests: requests.map(requestLine),
      };
    }
    case 'practice_calendar': {
      const { from, to } = range(args);
      const events = await sources.events(
        zonedTimeToUtc(from, '00:00', PRACTICE_ZONE).toISOString(),
        zonedTimeToUtc(addDaysTo(to, 1), '00:00', PRACTICE_ZONE).toISOString(),
      );
      return events.map((event) => ({
        kind: event.kind,
        title: event.title,
        ...(event.allDay
          ? { allDay: true, from: day(event.startsAt), until: day(event.endsAt) }
          : { day: day(event.startsAt), from: clock(event.startsAt), until: clock(event.endsAt) }),
        where: event.atLocation?.name ?? event.location?.name ?? event.place ?? undefined,
        // A rep lunch: who, never their phone or the practice's notes on them.
        rep: event.rep ? { name: event.rep.name, company: event.rep.company } : undefined,
      }));
    }
    case 'pay_days': {
      const { from, to } = range(args);
      return sources.payDays(from, to);
    }
    case 'directory': {
      const wanted = typeof args.name === 'string' ? args.name.trim().toLowerCase() : '';
      const people = await sources.directory();
      return people
        .map((person) => ({
          name: `${person.preferredName ?? person.firstName} ${person.lastName}`,
          fullName: `${person.firstName} ${person.lastName}`,
          pronouns: person.pronouns ?? undefined,
          jobRoles: person.jobRoles.map((role) => role.name),
          offices: person.locations.map((location) => location.name),
          email: person.email ?? undefined,
          phone: person.phone ?? undefined,
          onLeave: person.onLeave || undefined,
          inNow: person.onNow
            ? person.onNow.remote
              ? 'working from home'
              : (person.onNow.location?.name ?? 'yes')
            : undefined,
          workingFromHomeToday: person.homeToday
            ? `${clock(person.homeToday.startsAt)}–${clock(person.homeToday.endsAt)}`
            : undefined,
        }))
        .filter(
          (person) =>
            !wanted ||
            person.name.toLowerCase().includes(wanted) ||
            person.fullName.toLowerCase().includes(wanted),
        );
    }
    case 'rota': {
      const date = isoDay(args.date, 'date');
      const office = typeof args.office === 'string' ? args.office.trim().toLowerCase() : '';
      const shifts = await sources.shifts({
        from: zonedTimeToUtc(date, '00:00', PRACTICE_ZONE),
        to: zonedTimeToUtc(addDaysTo(date, 1), '23:59', PRACTICE_ZONE),
        publishedOnly: false,
      });
      return shifts
        .filter((shift) => day(shift.startsAt) === date && shift.status !== 'CANCELLED')
        .filter((shift) => !office || shift.location.name.toLowerCase().includes(office))
        .map((shift) => ({
          who: shift.employee
            ? `${shift.employee.preferredName ?? shift.employee.firstName} ${shift.employee.lastName}`
            : 'Open shift — nobody yet',
          ...shiftLine(shift),
          draft: shift.status === 'DRAFT' || undefined,
        }));
    }
    case 'time_off_requests': {
      const requests = await sources.timeOff({ status: 'PENDING' });
      return requests.map((request) => ({
        who: request.employee
          ? `${request.employee.preferredName ?? request.employee.firstName} ${request.employee.lastName}`
          : undefined,
        ...requestLine(request),
      }));
    }
    case 'needs_attention': {
      const contents = await sources.attention();
      return Object.fromEntries(Object.entries(contents).filter(([, lines]) => lines.length > 0));
    }
  }
}

function shiftLine(shift: {
  startsAt: Date;
  endsAt: Date;
  isRemote: boolean;
  notes: string | null;
  location: { name: string };
  jobRole: { name: string } | null;
}) {
  return {
    day: day(shift.startsAt),
    from: clock(shift.startsAt),
    until: clock(shift.endsAt),
    where: shift.isRemote ? 'working from home' : shift.location.name,
    jobRole: shift.jobRole?.name,
    note: shift.notes ?? undefined,
  };
}

function requestLine(request: {
  type: string;
  status: string;
  startDate: Date | string;
  endDate: Date | string;
  isHalfDay: boolean;
}) {
  return {
    kind: request.type === 'VACATION' ? 'PTO' : request.type,
    status: request.status,
    from: String(
      request.startDate instanceof Date ? request.startDate.toISOString() : request.startDate,
    ).slice(0, 10),
    to: String(
      request.endDate instanceof Date ? request.endDate.toISOString() : request.endDate,
    ).slice(0, 10),
    halfDay: request.isHalfDay || undefined,
  };
}

function range(args: Record<string, unknown>): { from: string; to: string } {
  const from = isoDay(args.from, 'from');
  const to = isoDay(args.to, 'to');
  if (to < from) throw new ToolRefused('"to" is before "from".');
  if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * 86_400_000) {
    throw new ToolRefused(`Ask for at most ${MAX_RANGE_DAYS} days at a time.`);
  }
  return { from, to };
}

function isoDay(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ToolRefused(`"${field}" must be a date, YYYY-MM-DD.`);
  }
  return value;
}

/// "2026-10-13", the day in New Jersey.
function day(instant: Date | string): string {
  return localDateIn(new Date(instant), PRACTICE_ZONE);
}

function clock(instant: Date | string): string {
  return localTimeIn(new Date(instant), PRACTICE_ZONE);
}
