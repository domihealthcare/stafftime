import type { ReimbursementRate } from './types';

const DOLLARS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/// A cell of the reimbursements board as shown: "$78.32", or the sheet's own
/// words ("$34.45 / 75.26").
export function formatRate(rate: Pick<ReimbursementRate, 'amount' | 'text'>): string {
  if (rate.amount !== null) return DOLLARS.format(Number(rate.amount));
  return rate.text ?? '';
}

const WHOLE_DOLLARS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/// The same, to the dollar, for the board on the page (October 2026,
/// Dominguez: no scrolling sideways): "$78". The exact amount is in the
/// cell's label and hover, and in the list a code opens.
export function formatRateShort(rate: Pick<ReimbursementRate, 'amount' | 'text'>): string {
  if (rate.amount !== null) return WHOLE_DOLLARS.format(Number(rate.amount));
  return rate.text ?? '';
}

/// As typed back in when editing: the amount as stored, or the words.
export function rateInput(rate: Pick<ReimbursementRate, 'amount' | 'text'> | undefined): string {
  if (!rate) return '';
  if (rate.amount !== null) return String(Number(rate.amount));
  return rate.text ?? '';
}
