#!/bin/bash
# Runs every browser suite against a locally running API (:3000) and web dev
# server (:5173). See README.md in this directory for what has to be up first.
#
# Each suite assumes a clean slate: nobody on the clock, no paired kiosks, no
# lockouts. Suites deliberately leave state behind (an open entry, a changed
# password, a rota), so reset between them rather than relying on run order.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$HERE/../../apps/api"
PGPORT_LOCAL="${PGPORT_LOCAL:-5433}"
PGHOST_LOCAL="${PGHOST_LOCAL:-127.0.0.1}"

reset_state() {
  (cd "$API_DIR" && npx ts-node prisma/seed.ts >/dev/null 2>&1)
  psql -h "$PGHOST_LOCAL" -p "$PGPORT_LOCAL" -U postgres -d stafftime -q \
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
    -c "delete from login_attempts;"
}

# The scheduler suite builds its rotas in February 2027 so that clearing them
# cannot touch the shift the seed puts on today's date.
SUITES="drive refusals correct auth kiosk export locations pto pto-policy presets calendar scheduler checklists"

failed=0
for suite in ${SUITES}; do
  reset_state
  printf "\n===== %s =====\n" "$suite"
  if ! (cd "$HERE" && node "$suite.mjs" "$@" 2>&1 | tail -40); then
    failed=1
  fi
done

reset_state
if [ "$failed" -eq 0 ]; then
  printf "\n===== every suite passed =====\n"
else
  printf "\n===== SOME SUITES FAILED =====\n"
fi
exit $failed
