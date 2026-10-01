/**
 * Lists of choices, as the clinical forms offer them.
 *
 * Each choice has a `value`, which the form keeps, and a `label`, which the
 * screen and the PDFs show. Change a label freely; change a value only if you
 * mean a different answer.
 */

export interface Choice {
  value: string;
  label: string;
}

export const choices = (...labels: [string, string][]): Choice[] =>
  labels.map(([value, label]) => ({ value, label }));

/// The value every "none" choice uses, so the form can treat them alike:
/// picking it clears the others, picking anything else clears it.
export const NONE = 'none';

/// The label for a stored value, or the value itself if it is not in the list.
export function labelOf(list: readonly Choice[], value: string): string {
  return list.find((choice) => choice.value === value)?.label ?? value;
}

/// Ticking a box in a list that has a "None": None clears the rest, and
/// anything else clears None — so "None" and a concern are never both ticked.
export function toggleChoice(current: string[], value: string, on: boolean): string[] {
  if (!on) return current.filter((item) => item !== value);
  if (value === NONE) return [NONE];
  return [...current.filter((item) => item !== NONE && item !== value), value];
}

/// Whether a list has anything ticked besides "None".
export function hasConcern(values: string[]): boolean {
  return values.some((value) => value !== NONE);
}
