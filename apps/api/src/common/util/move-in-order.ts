/**
 * A list's order after moving one item one place earlier (-1) or later (+1):
 * the ids in their new order, or null when it cannot move that way (already
 * first or last, or not in the list). The diagnostics and reimbursements
 * boards rewrite every `sortOrder` from this, so gaps and ties sort
 * themselves out.
 */
export function moveInOrder(ids: string[], id: string, by: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
