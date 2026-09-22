/**
 * Loads the demo data from a terminal.
 *
 *   APP_ENVIRONMENT=test npm run demo:seed --workspace @stafftime/api
 *
 * The generation itself lives in `src/demo/demo-data.ts`, because the app
 * serves the same thing from a button: whoever is setting up a deployment is
 * usually in a browser, not a terminal, and telling them to install Node to see
 * a populated app was the wrong answer.
 */
import { PrismaClient } from '@prisma/client';
import { loadDemoData } from '../src/demo/demo-data';

const prisma = new PrismaClient();

loadDemoData(prisma)
  .then((summary) => {
    console.log('\nDemo data loaded.\n');
    console.table([
      { what: 'staff added', count: summary.staffAdded },
      { what: 'shifts', count: summary.shifts },
      { what: 'time entries', count: summary.timeEntries },
      { what: 'entries with a flag on them', count: summary.flaggedEntries },
      { what: 'time off requests', count: summary.timeOffRequests },
      { what: 'checklists', count: summary.checklists },
    ]);
    console.log(`Every demo account signs in with: ${summary.sharedPassword}`);
    console.log('A walkthrough for reviewers is in docs/manager-review.md.\n');
  })
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
