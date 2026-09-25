import type { PrismaClient } from '@prisma/client';

/// Demo staff are tagged, so clearing them never touches a real account.
const DEMO_TAG = 'demo:';

/**
 * Everything a test deployment gathers that must not follow it into real use:
 * the demo staff (who all share one well-known password) and every shift,
 * punch, request, checklist, post and survey made while trying the app out.
 *
 * What stays is the practice's own set-up — decided with Dominguez, September
 * 2026: the offices and their pins, practice settings and the ADP set-up, job
 * roles and who is in them, closing checklists, checklist templates,
 * resources, time-off rules, kiosks, and every account that is not a demo
 * one, with its photo and PIN.
 *
 * The order matters only where a foreign key would refuse: exports before the
 * punches they list, closing records before the punches they belong to.
 */
export async function clearTestData(prisma: PrismaClient) {
  const counts = await prisma.$transaction(async (tx) => {
    const exports = await tx.payrollExport.deleteMany({});
    const closing = await tx.closingRecord.deleteMany({});
    const supplies = await tx.supplyRequest.deleteMany({});
    const entries = await tx.timeEntry.deleteMany({});
    const shifts = await tx.shift.deleteMany({});
    const timeOff = await tx.ptoRequest.deleteMany({});
    const checklists = await tx.employeeChecklist.deleteMany({});
    const credentials = await tx.employeeCredential.deleteMany({});
    const availability = await tx.unavailability.deleteMany({});
    const posts = await tx.announcement.deleteMany({});
    const surveys = await tx.survey.deleteMany({});
    const feedback = await tx.feedback.deleteMany({});
    const notifications = await tx.notification.deleteMany({});
    const reports = await tx.reportPreset.deleteMany({});
    const staff = await tx.employee.deleteMany({
      where: { externalId: { startsWith: DEMO_TAG } },
    });
    return {
      demoStaff: staff.count,
      shifts: shifts.count,
      timeEntries: entries.count,
      timeOffRequests: timeOff.count,
      checklists: checklists.count,
      closingChecklists: closing.count,
      restockRequests: supplies.count,
      licenses: credentials.count,
      availability: availability.count,
      posts: posts.count,
      surveys: surveys.count,
      suggestions: feedback.count,
      notifications: notifications.count,
      payrollExports: exports.count,
      savedReports: reports.count,
    };
  });
  return counts;
}

export type TestDataCounts = Awaited<ReturnType<typeof clearTestData>>;

/** What clearing would remove, and — as important — which accounts it keeps. */
export async function previewTestData(prisma: PrismaClient) {
  const [
    demoStaff,
    shifts,
    timeEntries,
    timeOffRequests,
    checklists,
    closingChecklists,
    restockRequests,
    licenses,
    availability,
    posts,
    surveys,
    suggestions,
    notifications,
    payrollExports,
    savedReports,
    keeping,
  ] = await prisma.$transaction([
    prisma.employee.count({ where: { externalId: { startsWith: DEMO_TAG } } }),
    prisma.shift.count(),
    prisma.timeEntry.count(),
    prisma.ptoRequest.count(),
    prisma.employeeChecklist.count(),
    prisma.closingRecord.count(),
    prisma.supplyRequest.count(),
    prisma.employeeCredential.count(),
    prisma.unavailability.count(),
    prisma.announcement.count(),
    prisma.survey.count(),
    prisma.feedback.count(),
    prisma.notification.count(),
    prisma.payrollExport.count(),
    prisma.reportPreset.count(),
    prisma.employee.findMany({
      where: {
        OR: [{ externalId: null }, { NOT: { externalId: { startsWith: DEMO_TAG } } }],
      },
      select: { firstName: true, lastName: true, email: true, role: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ]);
  const removing: TestDataCounts = {
    demoStaff,
    shifts,
    timeEntries,
    timeOffRequests,
    checklists,
    closingChecklists,
    restockRequests,
    licenses,
    availability,
    posts,
    surveys,
    suggestions,
    notifications,
    payrollExports,
    savedReports,
  };
  return { removing, keepingAccounts: keeping };
}
