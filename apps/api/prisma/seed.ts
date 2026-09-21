import { hash } from '@node-rs/argon2';
import { EmploymentStatus, PayType, PrismaClient, Role, ShiftStatus } from '@prisma/client';

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
async function main() {
  const northBergen = await prisma.location.upsert({
    where: { slug: 'north-bergen' },
    update: {},
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
    update: {},
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

  const employees = await prisma.employee.findMany({
    select: { email: true, role: true, mustChangePassword: true },
    orderBy: { email: 'asc' },
  });

  console.log('\nSeeded locations:');
  console.table([northBergen, westNewYork].map((l) => ({ name: l.name, slug: l.slug })));
  console.log(`Seeded sign-ins — every account's password is: ${DEV_PASSWORD}`);
  console.table(employees);
  console.log(
    'ma@domihealthcare.com starts with a temporary password, to demonstrate the forced change.\n',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
