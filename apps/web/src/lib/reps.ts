import type { RepFood, RepStatus } from './types';

/// How a rep feeds the office, in the words on screen.
export const FOOD_LABEL: Record<RepFood, string> = {
  CATERING: 'Brings catering',
  SELF_ORDER: 'Office orders (self-order)',
};

/// How welcome a rep is, in words, with a tone for its badge.
export const STATUS_LABEL: Record<
  RepStatus,
  { text: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }
> = {
  PREFERRED: { text: 'Preferred', tone: 'success' },
  OK: { text: 'OK to book', tone: 'neutral' },
  RESTRICTED: { text: 'Has restrictions', tone: 'warning' },
  DO_NOT_BOOK: { text: 'Don’t book', tone: 'danger' },
};
