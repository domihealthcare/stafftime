import { hash } from '@node-rs/argon2';
import {
  ChecklistKind,
  EmploymentStatus,
  PayType,
  PrismaClient,
  Role,
  ShiftStatus,
  TaskOwner,
} from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Development seed: the two real Domi Healthcare locations plus a handful of
 * test staff, so the API is usable the moment the database is up.
 *
 * Coordinates are approximate town-centre points and the geofence radii are
 * placeholders — see docs/open-questions.md. Replace both with surveyed values
 * before anyone clocks in for real.
 *
 * Every seeded account shares one well-known development password. That is
 * acceptable precisely because this script is for local work only — never point
 * it at a real database. Production accounts are created with
 * `npm run create-admin`, which prompts for a password.
 */
const DEV_PASSWORD = 'shift-change-2026';

/// Development kiosk PINs, one per seeded person so the keypad is usable
/// immediately. Like the password above, this is local-only.
const DEV_PINS: Record<string, string> = {
  'admin@domihealthcare.com': '8261',
  'manager@domihealthcare.com': '7394',
  'frontdesk@domihealthcare.com': '4817',
  'ma@domihealthcare.com': '5063',
};
async function main() {
  const northBergen = await prisma.location.upsert({
    where: { slug: 'north-bergen' },
    // Reset the geofence too, so seeding always gives a known starting point —
    // otherwise an experiment on the Locations screen quietly persists.
    update: {
      latitude: 40.804,
      longitude: -74.012,
      geofenceRadiusMeters: 150,
      allowedIps: [],
      kioskEnabled: true,
      isActive: true,
    },
    create: {
      name: 'North Bergen',
      slug: 'north-bergen',
      addressLine1: 'TODO: street address',
      city: 'North Bergen',
      state: 'NJ',
      postalCode: '07047',
      timezone: 'America/New_York',
      latitude: 40.804,
      longitude: -74.012,
      geofenceRadiusMeters: 150,
      allowedIps: [],
      kioskEnabled: true,
    },
  });

  const westNewYork = await prisma.location.upsert({
    where: { slug: 'west-new-york' },
    update: {
      latitude: 40.7878,
      longitude: -74.0143,
      geofenceRadiusMeters: 150,
      allowedIps: [],
      kioskEnabled: true,
      isActive: true,
    },
    create: {
      name: 'West New York',
      slug: 'west-new-york',
      addressLine1: 'TODO: street address',
      city: 'West New York',
      state: 'NJ',
      postalCode: '07093',
      timezone: 'America/New_York',
      latitude: 40.7878,
      longitude: -74.0143,
      geofenceRadiusMeters: 150,
      allowedIps: [],
      kioskEnabled: true,
    },
  });

  const people = [
    {
      email: 'admin@domihealthcare.com',
      firstName: 'Ada',
      lastName: 'Admin',
      role: Role.ADMIN,
      locations: [northBergen.id, westNewYork.id],
      primary: northBergen.id,
      mustChangePassword: false,
    },
    {
      email: 'manager@domihealthcare.com',
      firstName: 'Morgan',
      lastName: 'Manager',
      role: Role.MANAGER,
      locations: [northBergen.id, westNewYork.id],
      primary: northBergen.id,
      mustChangePassword: false,
    },
    {
      email: 'frontdesk@domihealthcare.com',
      firstName: 'Frankie',
      lastName: 'Front-Desk',
      role: Role.EMPLOYEE,
      locations: [northBergen.id],
      primary: northBergen.id,
      mustChangePassword: false,
    },
    {
      email: 'ma@domihealthcare.com',
      firstName: 'Max',
      lastName: 'Assistant',
      role: Role.EMPLOYEE,
      locations: [westNewYork.id],
      primary: westNewYork.id,
      // Left true on purpose, so the forced-password-change flow is easy to try.
      mustChangePassword: true,
    },
  ];

  const passwordHash = await hash(DEV_PASSWORD);

  for (const person of people) {
    const pinHash = await hash(DEV_PINS[person.email]);
    const employee = await prisma.employee.upsert({
      where: { email: person.email },
      // Reset credentials on every seed so a half-finished experiment (a lockout,
      // a changed password) never leaves you unable to sign in.
      update: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        mustChangePassword: person.mustChangePassword,
        failedLoginAttempts: 0,
        lockedUntil: null,
        pinHash,
        pinUpdatedAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
      create: {
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        role: person.role,
        employmentStatus: EmploymentStatus.ACTIVE,
        payType: PayType.HOURLY,
        hireDate: new Date('2025-01-06'),
        passwordHash,
        passwordUpdatedAt: new Date(),
        mustChangePassword: person.mustChangePassword,
        pinHash,
        pinUpdatedAt: new Date(),
      },
    });

    for (const locationId of person.locations) {
      await prisma.employeeLocation.upsert({
        where: { employeeId_locationId: { employeeId: employee.id, locationId } },
        update: {},
        create: {
          employeeId: employee.id,
          locationId,
          isPrimary: locationId === person.primary,
        },
      });
    }
  }

  // One published shift today so the scheduler and shift-matching have something
  // to show without hand-creating data.
  const frontDesk = await prisma.employee.findUniqueOrThrow({
    where: { email: 'frontdesk@domihealthcare.com' },
  });

  const shiftStart = new Date();
  shiftStart.setUTCHours(13, 0, 0, 0); // 9am Eastern
  const shiftEnd = new Date(shiftStart);
  shiftEnd.setUTCHours(21, 0, 0, 0); // 5pm Eastern

  const existingShift = await prisma.shift.findFirst({
    where: { employeeId: frontDesk.id, startsAt: shiftStart },
  });
  if (!existingShift) {
    await prisma.shift.create({
      data: {
        employeeId: frontDesk.id,
        locationId: northBergen.id,
        startsAt: shiftStart,
        endsAt: shiftEnd,
        status: ShiftStatus.PUBLISHED,
      },
    });
  }

  const templates = await seedChecklistTemplates();

  const employees = await prisma.employee.findMany({
    select: { email: true, role: true, mustChangePassword: true },
    orderBy: { email: 'asc' },
  });
  const withPins = employees.map((employee) => ({
    ...employee,
    kioskPin: DEV_PINS[employee.email],
  }));

  console.log('\nSeeded locations:');
  console.table([northBergen, westNewYork].map((l) => ({ name: l.name, slug: l.slug })));
  console.log(`Seeded sign-ins — every account's password is: ${DEV_PASSWORD}`);
  console.table(withPins);
  console.log(
    'ma@domihealthcare.com starts with a temporary password, to demonstrate the forced change.\n',
  );
  console.log('Seeded checklist templates:');
  console.table(templates);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// ---------------------------------------------------------------------------
// Default checklist templates
// ---------------------------------------------------------------------------

/// Starting points, not gospel. These are the tasks a small New Jersey primary
/// care practice actually has to get through, in roughly the order they happen,
/// so the practice can edit a real list rather than build one from nothing.
///
/// `dueOffsetDays` is relative to the hire date (onboarding) or the last day
/// (offboarding) — negative means before it.
const ONBOARDING_TASKS: TemplateTaskSeed[] = [
  {
    title: 'Signed offer letter on file',
    owner: TaskOwner.ADMIN,
    requiresDocument: true,
    dueOffsetDays: -7,
  },
  {
    title: 'Form I-9 completed and verified',
    description:
      'Section 1 by the employee on or before day one; Section 2 by the practice within three business days of the start date. Keep a copy of the documents presented.',
    owner: TaskOwner.ADMIN,
    requiresDocument: true,
    dueOffsetDays: 3,
  },
  {
    title: 'Form W-4 and NJ-W4 completed',
    owner: TaskOwner.ADMIN,
    requiresDocument: true,
    dueOffsetDays: 1,
  },
  {
    title: 'Direct deposit details submitted to payroll',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 3,
  },
  {
    title: 'Added to ADP TotalSource',
    description: 'So the first payroll run picks them up.',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 3,
  },
  {
    title: 'Employee handbook read and acknowledged',
    description:
      'Includes the clock-in policy and the location-tracking disclosure for browser clock-ins.',
    owner: TaskOwner.EMPLOYEE,
    requiresDocument: true,
    dueOffsetDays: 5,
  },
  {
    title: 'HIPAA privacy and security training completed',
    owner: TaskOwner.EMPLOYEE,
    requiresDocument: true,
    dueOffsetDays: 14,
  },
  {
    title: 'Professional licence or certification verified',
    description: 'Where the role has one. Note the expiry date so it can be re-checked.',
    owner: TaskOwner.ADMIN,
    requiresDocument: true,
    dueOffsetDays: 0,
  },
  {
    title: 'CPR / BLS card on file',
    description: 'Clinical staff. Mark not applicable for non-clinical roles.',
    owner: TaskOwner.ADMIN,
    requiresDocument: true,
    dueOffsetDays: 14,
  },
  {
    title: 'Emergency contact recorded',
    owner: TaskOwner.EMPLOYEE,
    dueOffsetDays: 1,
  },
  {
    title: 'Time & Scheduling account created, with locations assigned',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: -1,
  },
  {
    title: 'Kiosk PIN issued',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 0,
  },
  {
    title: 'EMR account requested',
    description: 'Domi EMR is a separate system — this is a request to whoever administers it.',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 0,
  },
  {
    title: 'Practice email account created',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: -1,
  },
  {
    title: 'Building keys / door code / badge issued',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: 0,
  },
  {
    title: 'First-week schedule built and published',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: -3,
  },
  {
    title: 'Introduced to the team and shown both locations',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: 1,
  },
  {
    title: '30-day check-in held',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: 30,
  },
];

const OFFBOARDING_TASKS: TemplateTaskSeed[] = [
  {
    title: 'Resignation letter or termination notice on file',
    owner: TaskOwner.ADMIN,
    requiresDocument: true,
    dueOffsetDays: -14,
  },
  {
    title: 'Last day confirmed with the employee in writing',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: -14,
  },
  {
    title: 'Shifts after the last day reassigned',
    description: 'Check the coverage summary for the weeks after they leave.',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: -7,
  },
  {
    title: 'Exit conversation held',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: -1,
  },
  {
    title: 'Final timesheet reviewed and approved',
    description: 'Including any missing punches on the last day.',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: 1,
  },
  {
    title: 'Accrued PTO balance confirmed for the final cheque',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 1,
  },
  {
    title: 'Termination filed in ADP TotalSource',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 1,
  },
  {
    title: 'Final pay issued',
    description:
      'New Jersey requires the final wages by the next regular payday. Note the date.',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 7,
  },
  {
    title: 'Benefits ended and COBRA notice sent',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 7,
  },
  {
    title: 'Laptop, phone and any other equipment returned',
    owner: TaskOwner.MANAGER,
    requiresDocument: true,
    dueOffsetDays: 0,
  },
  {
    title: 'Keys, door code and badge returned or revoked',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: 0,
  },
  {
    title: 'Time & Scheduling access revoked',
    description:
      'Marking them as no longer employed on the Staff screen signs them out everywhere and stops them clocking in.',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 0,
  },
  {
    title: 'Kiosk PIN removed',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 0,
  },
  {
    title: 'EMR access revoked',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 0,
  },
  {
    title: 'Email account disabled and mail forwarded',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 0,
  },
  {
    title: 'Patient-facing handover completed',
    description: 'Clinical staff: who is picking up their panel and open messages.',
    owner: TaskOwner.MANAGER,
    dueOffsetDays: -1,
  },
  {
    title: 'Personnel file closed, with records retained as required',
    description:
      'The I-9 has its own retention rule: three years after the hire date, or one year after the last day, whichever is later.',
    owner: TaskOwner.ADMIN,
    dueOffsetDays: 7,
  },
];

interface TemplateTaskSeed {
  title: string;
  description?: string;
  owner: TaskOwner;
  requiresDocument?: boolean;
  dueOffsetDays?: number;
}

/// Replaces the default templates outright, the way the rest of the seed does —
/// so `db:seed` gives a known starting state rather than a pile of copies.
/// Checklists already started are snapshots, so this cannot disturb them.
async function seedChecklistTemplates() {
  const defaults: { kind: ChecklistKind; name: string; description: string; tasks: TemplateTaskSeed[] }[] = [
    {
      kind: ChecklistKind.ONBOARDING,
      name: 'New hire — Domi Healthcare',
      description:
        'Everything from the signed offer letter to the 30-day check-in. Edit it to match how the practice actually works.',
      tasks: ONBOARDING_TASKS,
    },
    {
      kind: ChecklistKind.OFFBOARDING,
      name: 'Departure — Domi Healthcare',
      description:
        'Final pay, equipment back, and every system the person had access to.',
      tasks: OFFBOARDING_TASKS,
    },
  ];

  for (const template of defaults) {
    const existing = await prisma.checklistTemplate.findFirst({
      where: { kind: template.kind, name: template.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.checklistTemplateTask.deleteMany({
        where: { templateId: existing.id },
      });
      await prisma.checklistTemplate.update({
        where: { id: existing.id },
        data: {
          description: template.description,
          isDefault: true,
          archivedAt: null,
          tasks: { create: template.tasks.map(toTaskRow) },
        },
      });
    } else {
      await prisma.checklistTemplate.create({
        data: {
          kind: template.kind,
          name: template.name,
          description: template.description,
          isDefault: true,
          tasks: { create: template.tasks.map(toTaskRow) },
        },
      });
    }
  }

  return defaults.map((t) => ({ kind: t.kind, name: t.name, tasks: t.tasks.length }));
}

function toTaskRow(task: TemplateTaskSeed, index: number) {
  return {
    position: index,
    title: task.title,
    description: task.description,
    owner: task.owner,
    requiresDocument: task.requiresDocument ?? false,
    dueOffsetDays: task.dueOffsetDays,
  };
}
