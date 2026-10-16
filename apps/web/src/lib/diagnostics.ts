import type { DiagnosticAnswer } from './types';

/// How each answer on the diagnostics board reads and looks — green, red and
/// blue as on the practice's sheet, with the word always shown, so nothing
/// rests on the colour alone.
export const ANSWERS: DiagnosticAnswer[] = ['YES', 'NO', 'PA', 'CALL_REF', 'NA'];

/// Short, for the board's cells. English; the screen translates.
export const ANSWER_SHORT: Record<DiagnosticAnswer, string> = {
  YES: 'YES',
  NO: 'NO',
  PA: 'PA',
  CALL_REF: 'Call ref #',
  NA: 'N/A',
};

/// In words, for the key and a looked-up insurance.
export const ANSWER_WORDS: Record<DiagnosticAnswer, string> = {
  YES: 'Covered',
  NO: 'Not covered',
  PA: 'Needs a prior authorization',
  CALL_REF: 'Call the insurance for a reference #',
  NA: 'Does not apply',
};

export const ANSWER_CLASS: Record<DiagnosticAnswer, string> = {
  YES: 'bg-emerald-100 text-emerald-900',
  NO: 'bg-rose-100 text-rose-900',
  PA: 'bg-sky-100 text-sky-900',
  CALL_REF: 'bg-amber-100 text-amber-950',
  NA: 'bg-slate-100 text-slate-600',
};

/// "20 min · Fast 6 hrs", "20 min · No prep".
export function timeAndPrep(
  test: { duration: string | null; prep: string | null },
  noPrep: string,
): string {
  return [test.duration, test.prep ?? (test.duration ? noPrep : null)].filter(Boolean).join(' · ');
}

/// Loose matching for the search boxes: "aetna comm" finds "Aetna - COMM".
export function matches(text: string, query: string): boolean {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const haystack = text.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
