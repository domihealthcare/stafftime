/**
 * What was typed into a cell of the reimbursements board: an amount
 * ("78.32", "$1,150"), the words where a single amount will not do ("$24.79
 * (Dr) 21.07 (NP)", "$34.45 / 75.26" — as the sheet had them), or nothing,
 * which empties the cell. Pure.
 */
export type ParsedRate = { amount: string; text: null } | { amount: null; text: string } | null;

export const MAX_RATE_TEXT = 120;
const AMOUNT = /^\$?\s*([0-9]{1,8}(?:,[0-9]{3})*|[0-9]+)(\.[0-9]{1,4})?$/;

export function parseRate(value: string): ParsedRate {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const match = AMOUNT.exec(text);
  if (match) {
    const whole = match[1].replace(/,/g, '');
    if (whole.length <= 8) return { amount: `${whole}${match[2] ?? ''}`, text: null };
  }
  return { amount: null, text: text.slice(0, MAX_RATE_TEXT) };
}
