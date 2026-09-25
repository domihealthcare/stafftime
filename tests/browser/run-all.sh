#!/bin/bash
# Runs every browser suite against a locally running API (:3000) and web dev
# server (:5173). See README.md in this directory for what has to be up first.
#
# Each suite assumes a clean slate: nobody on the clock, no paired kiosks, no
# lockouts, and none of the demo data from `npm run db:demo`. Suites deliberately
# leave state behind (an open entry, a changed password, a rota, an edited
# template), so reset between them rather than relying on run order.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$HERE/../../apps/api"
PGPORT_LOCAL="${PGPORT_LOCAL:-5433}"
PGHOST_LOCAL="${PGHOST_LOCAL:-127.0.0.1}"
PGUSER_LOCAL="${PGUSER_LOCAL:-postgres}"
PGDATABASE_LOCAL="${PGDATABASE_LOCAL:-stafftime}"

reset_state() {
  (cd "$API_DIR" && npx ts-node prisma/seed.ts >/dev/null 2>&1)
  psql -h "$PGHOST_LOCAL" -p "$PGPORT_LOCAL" -U "$PGUSER_LOCAL" -d "$PGDATABASE_LOCAL" -q \
    -c "update time_entries set \"clockOutAt\" = \"clockInAt\" + interval '1 hour', status='COMPLETED' where \"clockOutAt\" is null;" \
    -c "delete from kiosk_devices;" \
    -c "delete from pto_requests;" \
    -c "delete from report_presets;" \
    -c "delete from pto_policy;" \
    -c "update employees set \"calendarToken\" = null, \"calendarTokenSetAt\" = null;" \
    -c "update employees set \"failedLoginAttempts\"=0, \"lockedUntil\"=null, \"pinFailedAttempts\"=0, \"pinLockedUntil\"=null;" \
    -c "delete from shifts where \"startsAt\" >= '2027-01-01';" \
    -c "delete from employee_checklists;" \
    -c "delete from stored_files;" \
    -c "delete from login_attempts;" \
    -c "delete from employees where \"externalId\" like 'demo:%';" \
    -c "delete from checklist_templates where \"createdById\" is not null;" \
    -c "delete from password_reset_tokens;" \
    -c "delete from payroll_exports;" \
    -c "delete from employee_credentials;" \
    -c "update employees set \"employmentStatus\" = 'ACTIVE', \"wantsDailyDigest\" = true;" \
    -c "delete from practice_settings;" \
    -c "delete from announcements;" \
    -c "delete from resources;" \
    -c "delete from unavailability;" \
    -c "delete from surveys;" \
    -c "delete from feedback;" \
    -c "delete from locations where slug not in ('north-bergen', 'west-new-york');" \
    -c "delete from time_entries where \"clockInVerification\" = 'REMOTE';" \
    -c "delete from shifts where notes = 'wfh-suite';" \
    -c "delete from shifts where notes = 'print-suite';" \
    -c "delete from closing_records;" \
    -c "delete from supply_requests;" \
    -c "delete from shifts where notes = 'availability-suite';" \
    -c "delete from shifts where notes = 'overtime-suite';" \
    -c "delete from shifts where notes = 'bell-suite';" \
    -c "delete from shifts where notes = 'attention-suite';" \
    -c "delete from employees where email like 'imp-%@example.com';" \
    -c "delete from notifications;" \
    -c "delete from shifts where \"employeeId\" is null;" \
    -c "delete from adp_settings;" \
    -c "delete from employee_photos;" \
    -c "update employees set pronouns = null, about = null, \"photoUpdatedAt\" = null, \"preferredName\" = null;" \
    -c "delete from time_entries where \"editReason\" = 'ADP suite: a full day';" \
    -c "update employees set \"adpFileNumber\" = null;" \
    -c "delete from job_roles where name not in ('Front Desk', 'Medical Assistant', 'Provider', 'Administrative', 'Manager');"
}

# The scheduler suite builds its rotas in February 2027 so that clearing them
# cannot touch the shift the seed puts on today's date.
SUITES="drive refusals correct auth kiosk export locations pto pto-policy presets calendar scheduler checklists phone reset payroll credentials privacy race attention announcements resources directory availability surveys dashboard date-ranges help adp profile rota wfh overtime bell rota-print closing install golive"

# Full output per suite goes to a file, and only the step lines are printed, so
# a failure's detail is still there to read rather than truncated away.
LOG_DIR="${LOG_DIR:-$HERE/logs}"
mkdir -p "$LOG_DIR"

failed=0
for suite in ${SUITES}; do
  reset_state
  printf "\n===== %s =====\n" "$suite"
  if ! (cd "$HERE" && node "$suite.mjs" "$@" > "$LOG_DIR/$suite.log" 2>&1); then
    failed=1
  fi
  grep -E '^(PASS|FAIL)|^ - |^PROBLEMS|^ALL ' "$LOG_DIR/$suite.log" || cat "$LOG_DIR/$suite.log"
done

reset_state
if [ "$failed" -eq 0 ]; then
  printf "\n===== every suite passed =====\n"
else
  printf "\n===== SOME SUITES FAILED — full output in %s =====\n" "$LOG_DIR"
fi
exit $failed
