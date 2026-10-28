import { execFileSync } from 'node:child_process';

/**
 * One finished punch for Max at North Bergen, written straight into the
 * database and tagged so run-all.sh clears it between suites.
 *
 * Some suites need a punch on screen (the timesheet, the export). They used
 * to lean on the punches `drive` left behind, which only worked while they ran
 * after it. CI runs the suites in parts on separate databases (October 2026),
 * so a suite makes what it needs.
 *
 * `minutesAgo` is when the punch ended; it lasted half an hour. With `count`
 * above 1, the others are a day apart, earlier.
 */
export function seedPunch(tag, minutesAgo = 5, count = 1) {
  const sql = (statement) =>
    execFileSync(
      'psql',
      [
        '-h', process.env.PGHOST_LOCAL || '127.0.0.1',
        '-p', process.env.PGPORT_LOCAL || '5433',
        '-U', process.env.PGUSER_LOCAL || 'postgres',
        '-d', process.env.PGDATABASE_LOCAL || 'stafftime',
        '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', statement,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    ).toString().trim();
  sql(`delete from time_entries where "handEntryNote" = '${tag}'`);
  for (let i = 0; i < count; i += 1) {
    const ended = minutesAgo + i * 24 * 60;
    sql(`insert into time_entries
      (id, "employeeId", "locationId", method, status, "clockInAt", "clockInVerification",
       "clockOutAt", "handEntryNote", "updatedAt")
      select gen_random_uuid(), e.id, l.id, 'WEB', 'COMPLETED',
        now() - interval '${ended + 30} minutes', 'GEOFENCE',
        now() - interval '${ended} minutes', '${tag}', now()
      from employees e, locations l
      where e.email = 'ma@domihealthcare.com' and l.slug = 'north-bergen'`);
  }
}
