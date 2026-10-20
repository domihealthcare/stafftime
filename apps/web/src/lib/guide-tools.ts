/**
 * The small helpers built into the guides (October 2026), as pure sums so the
 * screen only shows them. Each answers a question the documents answered by
 * hand: how many to dispense, new patient or follow up, which hospital code.
 */

export const FREQUENCIES = [
  { value: 'QD', label: 'QD - once a day', perDay: 1 },
  { value: 'BID', label: 'BID - twice a day', perDay: 2 },
  { value: 'TID', label: 'TID - three times a day', perDay: 3 },
  { value: 'QID', label: 'QID - four times a day', perDay: 4 },
  { value: 'Q12H', label: 'Q12H - every 12 hours', perDay: 2 },
  { value: 'QHS', label: 'QHS - at bedtime', perDay: 1 },
  { value: 'WEEKLY', label: 'Once a week', perDay: 0 },
] as const;

export type Frequency = (typeof FREQUENCIES)[number]['value'];

/// How many to dispense: pills a dose x doses a day x days. A weekly dose is
/// counted in whole weeks, four to a month, as the cheat sheet does (90 days
/// of Vitamin D 50,000 weekly is 12).
export function pillCount(
  perDose: number,
  frequency: Frequency,
  days: number,
): { quantity: number; working: string } | null {
  if (!(perDose > 0) || !(days > 0)) return null;
  if (frequency === 'WEEKLY') {
    const weeks = Math.max(1, Math.round((days * 4) / 30));
    return {
      quantity: perDose * weeks,
      working: `${perDose} x once a week x ${weeks} weeks = ${perDose * weeks}`,
    };
  }
  const perDay = FREQUENCIES.find((entry) => entry.value === frequency)!.perDay;
  const quantity = perDose * perDay * days;
  return {
    quantity,
    working: `${perDose} x ${perDay} a day x ${days} days = ${quantity}`,
  };
}

/// New patient or follow up: a follow up is seen within the last 3 years, to
/// the day (Front Desk Cheat Sheet). Dates are YYYY-MM-DD.
export function newOrFollowUp(
  lastSeen: string,
  today: string,
): { kind: 'NEW' | 'FOLLOW_UP'; newFrom: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastSeen) || lastSeen > today) return null;
  const newFrom = `${Number(lastSeen.slice(0, 4)) + 3}${lastSeen.slice(4)}`;
  return { kind: today >= newFrom ? 'NEW' : 'FOLLOW_UP', newFrom };
}

export const HOSPITAL_CODES = {
  initial: [
    { code: '99221', minutes: 30 },
    { code: '99222', minutes: 50 },
    { code: '99223', minutes: 70 },
  ],
  subsequent: [
    { code: '99231', minutes: 15 },
    { code: '99232', minutes: 25 },
    { code: '99233', minutes: 35 },
  ],
} as const;

/// The highest hospital care code whose time is met, from the templates'
/// table; null below the lowest.
export function hospitalCode(
  kind: keyof typeof HOSPITAL_CODES,
  minutes: number,
): { code: string; minutes: number; next?: { code: string; minutes: number } } | null {
  const codes = HOSPITAL_CODES[kind];
  let best: { code: string; minutes: number } | null = null;
  for (const entry of codes) if (minutes >= entry.minutes) best = entry;
  if (!best) return null;
  const next = codes.find((entry) => entry.minutes > best!.minutes);
  return { ...best, next };
}
