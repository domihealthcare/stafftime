/**
 * Demo data for the manager review.
 *
 * `db:seed` gives you the two locations and four accounts — enough to sign in,
 * not enough to judge anything. A timesheet with one entry in it tells a
 * practice manager nothing about whether the timesheet is any good.
 *
 * This fills in a plausible five weeks: eight more staff across the two
 * offices, rotas,
 * punches that are mostly fine and occasionally not (someone late, someone
 * who forgot to clock out, an entry a manager had to correct), time off in
 * every state, somebody over forty hours so the overtime column has something
 * to show, and a checklist part-way through.
 *
 * It is deterministic. Running it twice gives the same data, so two people
 * looking at the app are looking at the same thing.
 *
 * It is a **reset**: every existing shift, punch, time off request and
 * checklist is cleared first, so the app holds the demo week and nothing else.
 * Locations and accounts are left alone — those belong to `db:seed`, and a
 * reviewer may have set real geofence coordinates.
 *
 *   npm run demo:seed --workspace @stafftime/api
 *
 * It refuses to run against a production deployment. See the guard below.
 */
import { hash } from '@node-rs/argon2';
import {
  ChecklistKind,
  ChecklistTaskStatus,
  ClockMethod,
  EmploymentStatus,
  PayType,
  PrismaClient,
  PtoStatus,
  PtoType,
  Role,
  ShiftStatus,
  TimeEntryStatus,
  VerificationMethod,
} from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'shift-change-2026';
const WEEKS_BACK = 3;
const WEEKS_FORWARD = 2;

/// Everything this script creates is tagged, so it can clear its own data
/// without touching anything a reviewer set up by hand.
const DEMO_TAG = 'demo:';

interface Person {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  payType: PayType;
  /// Office slug they work at.
  office: 'north-bergen' | 'west-new-york';
  /// Wall-clock start and end of their usual day, Eastern.
  startHour: number;
  endHour: number;
  hireDate: string;
  pin: string;
  /// Which weekdays they work (1 = Monday).
  days: number[];
}

const PEOPLE: Person[] = [
  {
    email: 'r.alvarez@domihealthcare.com',
    firstName: 'Rosa',
    lastName: 'Alvarez',
    role: Role.MANAGER,
    payType: PayType.SALARY,
    office: 'north-bergen',
    startHour: 8,
    endHour: 17,
    hireDate: '2022-03-14',
    pin: '2914',
    days: [1, 2, 3, 4, 5],
  },
  {
    email: 'd.okafor@domihealthcare.com',
    firstName: 'Daniel',
    lastName: 'Okafor',
    role: Role.EMPLOYEE,
    payType: PayType.HOURLY,
    office: 'north-bergen',
    startHour: 8,
    endHour: 16,
    hireDate: '2023-06-05',
    pin: '3827',
    days: [1, 2, 3, 4, 5],
  },
  {
    email: 'p.nguyen@domihealthcare.com',
    firstName: 'Phuong',
    lastName: 'Nguyen',
    role: Role.EMPLOYEE,
    payType: PayType.HOURLY,
    office: 'north-bergen',
    startHour: 9,
    endHour: 17,
    hireDate: '2024-02-12',
    pin: '5140',
    days: [1, 2, 3, 4, 5],
  },
  {
    email: 'j.santos@domihealthcare.com',
    firstName: 'Julia',
    lastName: 'Santos',
    role: Role.EMPLOYEE,
    payType: PayType.HOURLY,
    office: 'north-bergen',
    startHour: 10,
    endHour: 18,
    hireDate: '2024-09-03',
    pin: '6472',
    days: [1, 2, 3, 4],
  },
  {
    email: 'k.brennan@domihealthcare.com',
    firstName: 'Kevin',
    lastName: 'Brennan',
    role: Role.EMPLOYEE,
    payType: PayType.HOURLY,
    office: 'west-new-york',
    startHour: 8,
    endHour: 16,
    hireDate: '2023-11-06',
    pin: '7358',
    days: [1, 2, 3, 4, 5],
  },
  {
    email: 'a.haddad@domihealthcare.com',
    firstName: 'Amal',
    lastName: 'Haddad',
    role: Role.EMPLOYEE,
    payType: PayType.HOURLY,
    office: 'west-new-york',
    startHour: 9,
    endHour: 17,
    hireDate: '2025-04-21',
    pin: '8291',
    days: [1, 2, 3, 4, 5],
  },
  {
    email: 't.lindqvist@domihealthcare.com',
    firstName: 'Tove',
    lastName: 'Lindqvist',
    role: Role.EMPLOYEE,
    payType: PayType.HOURLY,
    office: 'west-new-york',
    startHour: 10,
    endHour: 18,
    hireDate: '2025-08-11',
    pin: '9043',
    days: [2, 3, 4, 5],
  },
  {
    email: 'b.oyelaran@domihealthcare.com',
    firstName: 'Bola',
    lastName: 'Oyelaran',
    role: Role.EMPLOYEE,
    payType: PayType.SALARY,
    office: 'west-new-york',
    startHour: 8,
    endHour: 17,
    hireDate: '2021-07-19',
    pin: '1586',
    days: [1, 2, 3, 4, 5],
  },
];

/// Fixed-seed generator, so every run produces the same "random" minutes.
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

async function main() {
  assertNotProduction();

  const locations = await prisma.location.findMany({ select: { id: true, slug: true } });
  const office = new Map(locations.map((l) => [l.slug, l.id]));
  if (!office.has('north-bergen') || !office.has('west-new-york')) {
    throw new Error('Run `npm run db:seed` first — the locations are missing.');
  }

  await clearPreviousDemoData();

  const passwordHash = await hash(DEMO_PASSWORD);
  const random = makeRandom(20260922);

  const created: { id: string; person: Person }[] = [];
  for (const person of PEOPLE) {
    const pinHash = await hash(person.pin);
    const employee = await prisma.employee.upsert({
      where: { email: person.email },
      update: {
        firstName: person.firstName,
        lastName: person.lastName,
        role: person.role,
        payType: person.payType,
        employmentStatus: EmploymentStatus.ACTIVE,
        hireDate: new Date(`${person.hireDate}T00:00:00.000Z`),
        passwordHash,
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        pinHash,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        externalId: `${DEMO_TAG}${person.email}`,
      },
      create: {
        email: person.email,
        firstName: person.firstName,
        lastName: person.lastName,
        role: person.role,
        payType: person.payType,
        employmentStatus: EmploymentStatus.ACTIVE,
        hireDate: new Date(`${person.hireDate}T00:00:00.000Z`),
        passwordHash,
        passwordUpdatedAt: new Date(),
        mustChangePassword: false,
        pinHash,
        pinUpdatedAt: new Date(),
        externalId: `${DEMO_TAG}${person.email}`,
      },
    });

    const locationId = office.get(person.office)!;
    await prisma.employeeLocation.upsert({
      where: { employeeId_locationId: { employeeId: employee.id, locationId } },
      update: { isPrimary: true },
      create: { employeeId: employee.id, locationId, isPrimary: true },
    });

    created.push({ id: employee.id, person });
  }

  const manager = created.find((entry) => entry.person.role === Role.MANAGER)!;


  for (const { id, person } of created) {
    const locationId = office.get(person.office)!;

    for (const date of workingDates(person.days)) {
      const startsAt = easternWallClock(date, person.startHour);
      const endsAt = easternWallClock(date, person.endHour);
      const isPast = endsAt < new Date();

      const shift = await prisma.shift.create({
        data: {
          employeeId: id,
          locationId,
          startsAt,
          endsAt,
          // Everything up to next week is published; the week after is still a
          // draft, so there is something to look at on the scheduler.
          status: isNextWeekOrEarlier(date) ? ShiftStatus.PUBLISHED : ShiftStatus.DRAFT,
          createdById: manager.id,
          notes: `${DEMO_TAG}rota`,
        },
      });
      if (!isPast) continue;

      // A punch is usually a few minutes either side of the shift. Occasionally
      // it is not, and that is the interesting case.
      const roll = random();
      const lateMinutes = roll > 0.88 ? 12 + Math.floor(random() * 20) : Math.floor(random() * 5) - 2;
      const earlyMinutes = roll < 0.06 ? 18 + Math.floor(random() * 15) : Math.floor(random() * 4) - 2;

      const clockInAt = addMinutes(startsAt, lateMinutes);
      const forgotToClockOut = roll > 0.965;
      const clockOutAt = forgotToClockOut ? null : addMinutes(endsAt, -earlyMinutes);

      const isLate = lateMinutes > 5;
      const isEarlyDeparture = !forgotToClockOut && earlyMinutes > 5;

      // Most punches come from the kiosk at the front desk; a few are from a
      // phone inside the geofence.
      const viaKiosk = random() > 0.3;

      await prisma.timeEntry.create({
        data: {
          employeeId: id,
          locationId,
          shiftId: shift.id,
          method: viaKiosk ? ClockMethod.KIOSK : ClockMethod.MOBILE,
          status: forgotToClockOut
            ? TimeEntryStatus.NEEDS_REVIEW
            : isSettledWeek(date)
              ? TimeEntryStatus.APPROVED
              : TimeEntryStatus.COMPLETED,
          clockInAt,
          clockInVerification: viaKiosk
            ? VerificationMethod.KIOSK
            : VerificationMethod.GEOFENCE,
          clockInAccuracyMeters: viaKiosk ? null : 18 + Math.floor(random() * 30),
          clockOutAt,
          clockOutVerification: forgotToClockOut
            ? null
            : viaKiosk
              ? VerificationMethod.KIOSK
              : VerificationMethod.GEOFENCE,
          isLate,
          isEarlyDeparture,
          isMissingPunch: forgotToClockOut,
          ...(isSettledWeek(date) && !forgotToClockOut
            ? { approvedById: manager.id, approvedAt: addMinutes(endsAt, 60 * 18) }
            : {}),
        },
      });
    }
  }

  // Somebody covering a sixth day, so one week goes past forty hours and the
  // export's overtime split has something in it.
  const overtimeFor = created.find((entry) => entry.person.email === 'd.okafor@domihealthcare.com')!;
  const saturday = lastSaturday();
  const otStart = easternWallClock(saturday, 9);
  const otEnd = easternWallClock(saturday, 15);
  const otShift = await prisma.shift.create({
    data: {
      employeeId: overtimeFor.id,
      locationId: office.get(overtimeFor.person.office)!,
      startsAt: otStart,
      endsAt: otEnd,
      status: ShiftStatus.PUBLISHED,
      createdById: manager.id,
      notes: `${DEMO_TAG}weekend cover`,
    },
  });
  await prisma.timeEntry.create({
    data: {
      employeeId: overtimeFor.id,
      locationId: office.get(overtimeFor.person.office)!,
      shiftId: otShift.id,
      method: ClockMethod.KIOSK,
      status: TimeEntryStatus.COMPLETED,
      clockInAt: otStart,
      clockInVerification: VerificationMethod.KIOSK,
      clockOutAt: otEnd,
      clockOutVerification: VerificationMethod.KIOSK,
    },
  });
  // One entry a manager had to fix, with the reason recorded — so the audit
  // trail on the timesheet is not theoretical.
  const corrected = await prisma.timeEntry.findFirst({
    where: { employeeId: created[2].id, clockOutAt: { not: null } },
    orderBy: { clockInAt: 'desc' },
  });
  if (corrected) {
    await prisma.timeEntry.update({
      where: { id: corrected.id },
      data: {
        clockOutAt: addMinutes(corrected.clockOutAt!, 35),
        isManuallyEdited: true,
        editedById: manager.id,
        editedAt: new Date(),
        editReason: 'Stayed to finish a referral; forgot to punch out until later.',
      },
    });
  }

  const pto = await seedTimeOff(created, manager.id);
  const checklists = await seedChecklists(created, manager.id);

  // Counted from the database rather than tallied along the way: approving
  // leave removes the punches inside it, so the running totals above are not
  // what ends up there.
  const [finalShifts, finalEntries, finalFlagged] = await Promise.all([
    prisma.shift.count(),
    prisma.timeEntry.count(),
    prisma.timeEntry.count({
      where: {
        OR: [
          { isLate: true },
          { isEarlyDeparture: true },
          { isMissingPunch: true },
          { isManuallyEdited: true },
        ],
      },
    }),
  ]);

  console.log('\nDemo data loaded.\n');
  console.table([
    { what: 'staff added', count: created.length },
    { what: 'shifts', count: finalShifts },
    { what: 'time entries', count: finalEntries },
    { what: 'entries with a flag on them', count: finalFlagged },
    { what: 'time off requests', count: pto },
    { what: 'checklists', count: checklists },
  ]);
  console.log(`Every demo account signs in with: ${DEMO_PASSWORD}`);
  console.log('Kiosk PINs are in prisma/demo.ts.\n');
  console.log('A walkthrough for reviewers is in docs/manager-review.md.\n');
}

/// The one thing this script must never do is invent hours on a live payroll.
function assertNotProduction() {
  const environment = process.env.APP_ENVIRONMENT ?? 'production';
  if (environment === 'production' && process.env.ALLOW_DEMO_DATA !== 'yes-really') {
    throw new Error(
      'Refusing to load demo data: APP_ENVIRONMENT is production. This creates ' +
        'fake staff, fake shifts and fake hours, and every account shares one ' +
        'well-known password. If you genuinely mean to do this on a test copy ' +
        'that is labelled production, set ALLOW_DEMO_DATA=yes-really.',
    );
  }
}

/**
 * Clears the practice's day-to-day data so the demo is the *only* thing in it.
 *
 * This is a reset, not an addition, and that is deliberate: the point of the
 * demo data is that two people looking at the app see the same thing. A
 * timesheet with a generated week next to leftovers from somebody's
 * experiments is harder to read than either on its own.
 *
 * Locations, accounts and checklist templates are left alone — those are
 * `db:seed`'s job, and a reviewer may have set real geofence coordinates.
 */
async function clearPreviousDemoData() {
  const staff = await prisma.employee.deleteMany({
    where: { externalId: { startsWith: DEMO_TAG } },
  });

  // The seeded accounts stay, but their punches and rotas go, so the only
  // hours on the timesheet are the ones this script put there.
  const [entries, shifts, requests, checklists] = await prisma.$transaction([
    prisma.timeEntry.deleteMany({}),
    prisma.shift.deleteMany({}),
    prisma.ptoRequest.deleteMany({}),
    prisma.employeeChecklist.deleteMany({}),
  ]);

  console.log(
    `Cleared ${staff.count} demo staff, ${entries.count} time entries, ${shifts.count} shifts, ${requests.count} time off requests and ${checklists.count} checklists.`,
  );
}

async function seedTimeOff(
  created: { id: string; person: Person }[],
  managerId: string,
): Promise<number> {
  const requests = [
    {
      employeeId: created[1].id,
      type: PtoType.VACATION,
      start: weekdaysFromToday(11),
      end: weekdaysFromToday(15),
      status: PtoStatus.PENDING,
      notes: 'Flights already booked — sorry for the short notice.',
    },
    {
      employeeId: created[5].id,
      type: PtoType.PERSONAL,
      start: weekdaysFromToday(4),
      end: weekdaysFromToday(4),
      status: PtoStatus.PENDING,
      notes: 'Dentist, morning only.',
      isHalfDay: true,
    },
    {
      employeeId: created[2].id,
      type: PtoType.VACATION,
      start: weekdaysFromToday(-9),
      end: weekdaysFromToday(-5),
      status: PtoStatus.APPROVED,
    },
    {
      employeeId: created[4].id,
      type: PtoType.SICK,
      start: weekdaysFromToday(-2),
      end: weekdaysFromToday(-2),
      status: PtoStatus.APPROVED,
      notes: 'Called in with a temperature.',
    },
    {
      employeeId: created[6].id,
      type: PtoType.VACATION,
      start: weekdaysFromToday(20),
      end: weekdaysFromToday(34),
      status: PtoStatus.DENIED,
      notes: 'Three weeks over the holidays.',
      reviewNote: 'Too long over a holiday period with nobody to cover. Happy to look at one week.',
    },
  ];

  for (const request of requests) {
    await prisma.ptoRequest.create({
      data: {
        employeeId: request.employeeId,
        type: request.type,
        startDate: request.start,
        endDate: request.end,
        status: request.status,
        isHalfDay: request.isHalfDay ?? false,
        notes: request.notes,
        ...(request.status === PtoStatus.PENDING
          ? {}
          : {
              reviewedById: managerId,
              reviewedAt: new Date(),
              reviewNote: request.reviewNote,
            }),
      },
    });
  }

  // Somebody on approved leave did not also clock in that day. Pending and
  // denied requests keep their shifts on purpose — that is what makes the
  // "shifts already scheduled in those dates" panel show something.
  for (const request of requests.filter((r) => r.status === PtoStatus.APPROVED)) {
    const until = new Date(request.end.getTime() + 86_400_000);
    const where = {
      employeeId: request.employeeId,
      clockInAt: { gte: request.start, lt: until },
    };
    await prisma.timeEntry.deleteMany({ where });
    await prisma.shift.deleteMany({
      where: {
        employeeId: request.employeeId,
        startsAt: { gte: request.start, lt: until },
      },
    });
  }

  return requests.length;
}

/// One onboarding part-way through and one offboarding finished, so both states
/// are visible without a reviewer having to build them.
async function seedChecklists(
  created: { id: string; person: Person }[],
  managerId: string,
): Promise<number> {
  const newest = created.find((entry) => entry.person.email === 't.lindqvist@domihealthcare.com')!;

  const onboarding = await prisma.checklistTemplate.findFirst({
    where: { kind: ChecklistKind.ONBOARDING, isDefault: true, archivedAt: null },
    include: { tasks: { orderBy: { position: 'asc' } } },
  });
  if (!onboarding) return 0;

  const anchor = new Date(`${newest.person.hireDate}T00:00:00.000Z`);
  const checklist = await prisma.employeeChecklist.create({
    data: {
      employeeId: newest.id,
      kind: ChecklistKind.ONBOARDING,
      name: onboarding.name,
      templateId: onboarding.id,
      anchorDate: anchor,
      createdById: managerId,
      tasks: {
        create: onboarding.tasks.map((task, index) => ({
          position: index,
          title: task.title,
          description: task.description,
          owner: task.owner,
          requiresDocument: task.requiresDocument,
          dueAt:
            task.dueOffsetDays === null
              ? null
              : new Date(anchor.getTime() + task.dueOffsetDays * 86_400_000),
        })),
      },
    },
    include: { tasks: { orderBy: { position: 'asc' } } },
  });

  // The ones that do not need a document are done; the paperwork is what is
  // still outstanding, which is exactly how it goes.
  for (const task of checklist.tasks) {
    if (task.requiresDocument) continue;
    await prisma.employeeChecklistTask.update({
      where: { id: task.id },
      data: {
        status: ChecklistTaskStatus.DONE,
        completedById: managerId,
        completedAt: new Date(),
      },
    });
  }

  return 1;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/// Eastern is UTC-4 in summer and UTC-5 in winter. Measuring the offset rather
/// than assuming one keeps a 9am shift at 9am across the clock change.
function easternWallClock(date: Date, hour: number): Date {
  const naive = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hour,
    0,
    0,
  );
  const guess = new Date(naive - offsetMinutes(new Date(naive)) * 60_000);
  return new Date(naive - offsetMinutes(guess) * 60_000);
}

function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset',
  }).formatToParts(at);
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-05:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return -300;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function startOfWeekUtc(date: Date): Date {
  const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (day - 1)),
  );
}

function workingDates(days: number[]): Date[] {
  const thisWeek = startOfWeekUtc(new Date());
  const dates: Date[] = [];

  for (let week = -WEEKS_BACK; week <= WEEKS_FORWARD; week += 1) {
    for (const weekday of days) {
      dates.push(
        new Date(thisWeek.getTime() + (week * 7 + (weekday - 1)) * 86_400_000),
      );
    }
  }
  return dates;
}

function isNextWeekOrEarlier(date: Date): boolean {
  const cutoff = startOfWeekUtc(new Date()).getTime() + 14 * 86_400_000;
  return date.getTime() < cutoff;
}

/// Weeks old enough that a manager would have signed them off already.
function isSettledWeek(date: Date): boolean {
  return date.getTime() < startOfWeekUtc(new Date()).getTime() - 7 * 86_400_000;
}

function lastSaturday(): Date {
  const thisWeek = startOfWeekUtc(new Date());
  return new Date(thisWeek.getTime() - 2 * 86_400_000);
}

function daysFromToday(days: number): Date {
  const today = new Date();
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days),
  );
}

/// Nobody at Domi works weekends, so a request that starts on a Saturday reads
/// like a bug in the demo data rather than a plausible request. Nudge forward.
function weekdaysFromToday(days: number): Date {
  const date = daysFromToday(days);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
