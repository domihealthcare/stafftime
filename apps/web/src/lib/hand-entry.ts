import type { HandEntryReason } from './types';

/// Why a manager had to enter somebody's hours by hand, as the form offers it
/// and the timesheet shows it. The server's nightly round-up uses the same
/// words (`HAND_ENTRY_REASONS` in attention.service.ts).
export const HAND_ENTRY_REASONS: { value: HandEntryReason; label: string; hint?: string }[] = [
  { value: 'FORGOT', label: 'Forgot to clock in or out' },
  {
    value: 'APP_REFUSED',
    label: 'The app would not let them clock in',
    hint: 'Write down what it said — this one may be a problem with the app.',
  },
  {
    value: 'NO_LOCATION_SHARING',
    label: 'Would rather not share their location',
    hint: 'There is no time clock yet, so their hours are entered by hand.',
  },
  { value: 'NO_PHONE', label: 'No phone, battery or signal' },
  { value: 'OTHER', label: 'Something else' },
];

export function handEntryReasonLabel(reason: HandEntryReason | null | undefined): string {
  return HAND_ENTRY_REASONS.find((option) => option.value === reason)?.label ?? 'No reason given';
}
