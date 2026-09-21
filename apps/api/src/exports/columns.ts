/**
 * Every column a timesheet export can contain, defined once.
 *
 * The web app builds its checkboxes from this list (via GET /exports/columns),
 * so the two can never drift apart.
 */
export const TIMESHEET_COLUMNS = [
  { key: 'date', label: 'Date', width: 12, group: 'Entry', default: true },
  { key: 'employee', label: 'Employee', width: 24, group: 'Employee', default: true },
  { key: 'email', label: 'Email', width: 30, group: 'Employee', default: false },
  {
    key: 'externalId',
    label: 'External ID',
    width: 16,
    group: 'Employee',
    default: false,
    hint: 'For matching to another system, such as a future EMR link',
  },
  { key: 'payType', label: 'Pay type', width: 12, group: 'Employee', default: false },
  { key: 'location', label: 'Location', width: 18, group: 'Entry', default: true },
  { key: 'clockIn', label: 'Clock in', width: 11, group: 'Entry', default: true },
  { key: 'clockOut', label: 'Clock out', width: 11, group: 'Entry', default: true },
  { key: 'hours', label: 'Hours', width: 9, group: 'Entry', default: true },
  {
    key: 'method',
    label: 'Method',
    width: 10,
    group: 'Verification',
    default: false,
    hint: 'Web, mobile or kiosk',
  },
  {
    key: 'verification',
    label: 'Verified by',
    width: 16,
    group: 'Verification',
    default: false,
    hint: 'How presence was proven: GPS, office network, kiosk or manual',
  },
  { key: 'shift', label: 'Scheduled shift', width: 20, group: 'Entry', default: false },
  {
    key: 'flags',
    label: 'Flags',
    width: 24,
    group: 'Review',
    default: true,
    hint: 'Late, left early, edited, missing punch',
  },
  { key: 'status', label: 'Status', width: 14, group: 'Review', default: false },
  { key: 'editedBy', label: 'Edited by', width: 20, group: 'Review', default: false },
  { key: 'editReason', label: 'Edit reason', width: 36, group: 'Review', default: false },
  { key: 'approvedBy', label: 'Approved by', width: 20, group: 'Review', default: false },
] as const;

export type TimesheetColumnKey = (typeof TIMESHEET_COLUMNS)[number]['key'];

export const ALL_COLUMN_KEYS: TimesheetColumnKey[] = TIMESHEET_COLUMNS.map((c) => c.key);

export const DEFAULT_COLUMN_KEYS: TimesheetColumnKey[] = TIMESHEET_COLUMNS.filter(
  (c) => c.default,
).map((c) => c.key);
