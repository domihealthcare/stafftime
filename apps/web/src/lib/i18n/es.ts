import { CALENDAR } from './es/calendar';
import { COMMON } from './es/common';
import { HOME } from './es/home';
import { SCHEDULE } from './es/schedule';
import { SHELL } from './es/shell';
import { TEAM } from './es/team';

/**
 * Every Spanish phrase, keyed by its English. Split by screen so each stays
 * readable; a phrase used on several screens lives in `common`.
 *
 * Register: "tú", as the English speaks to "you" plainly. To be read by a
 * native speaker before relying on it (`NEEDS_NATIVE_SPEAKER_REVIEW`).
 */
export const SPANISH: Record<string, string> = {
  ...COMMON,
  ...HOME,
  ...SCHEDULE,
  ...SHELL,
  ...TEAM,
  ...CALENDAR,
};
