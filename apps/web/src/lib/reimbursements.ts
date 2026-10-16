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

/// As typed back in when editing: the amount as stored, or the words.
export function rateInput(rate: Pick<ReimbursementRate, 'amount' | 'text'> | undefined): string {
  if (!rate) return '';
  if (rate.amount !== null) return String(Number(rate.amount));
  return rate.text ?? '';
}
