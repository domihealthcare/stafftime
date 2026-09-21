import { EmploymentStatus, PayType, PrismaClient, Role, ShiftStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Development seed: the two real Domi Healthcare locations plus a handful of
 * test staff, so the API is usable the moment the database is up.
 *
 * Coordinates are approximate town-centre points and the geofence radii are
 * placeholders — see docs/open-questions.md. Replace both with surveyed values
 * before anyone clocks in for real.
 */
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
    },
    {
      email: 'manager@domihealthcare.com',
      firstName: 'Morgan',
      lastName: 'Manager',
      role: Role.MANAGER,
      locations: [northBergen.id, westNewYork.id],
      primary: northBergen.id,
    },
    {
      email: 'frontdesk@domihealthcare.com',
      firstName: 'Frankie',
      lastName: 'Front-Desk',
      role: Role.EMPLOYEE,
      locations: [northBergen.id],
      primary: northBergen.id,
    },
    {
      email: 'ma@domihealthcare.com',
      firstName: 'Max',
      lastName: 'Assistant',
      role: Role.EMPLOYEE,
      locations: [westNewYork.id],
      primary: westNewYork.id,
    },
  ];

  for (const person of people) {
    const employee = await prisma.employee.upsert({
      where: { email: person.email },
      update: {},
      create: {
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        role: person.role,
        employmentStatus: EmploymentStatus.ACTIVE,
        payType: PayType.HOURLY,
        hireDate: new Date('2025-01-06'),
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
    select: { id: true, email: true, role: true },
    orderBy: { email: 'asc' },
  });

  console.log('\nSeeded locations:');
  console.table([northBergen, westNewYork].map((l) => ({ id: l.id, name: l.name, slug: l.slug })));
  console.log('Seeded employees (use the id as the x-dev-employee-id header):');
  console.table(employees);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
