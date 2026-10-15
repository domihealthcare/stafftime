/// How a cell reads at a glance — the diagnostics guide's answers: covered,
/// not covered, or needs a prior authorization. Mirrors `cellTone` in the
/// API's reference/paste.ts, which is unit-tested.
export type CellTone = 'yes' | 'no' | 'pa' | null;

export function cellTone(value: string): CellTone {
  const text = value.trim().toUpperCase();
  if (/^YES\b/.test(text) && !/\bPA\b/.test(text)) return 'yes';
  if (/^NO\b/.test(text) && !/PA NEEDED/.test(text)) return 'no';
  if (/^(PA|YES PA)\b/.test(text)) return 'pa';
  return null;
}

export const TONE_CLASS: Record<Exclude<CellTone, null>, string> = {
  yes: 'bg-emerald-50 text-emerald-900',
  no: 'bg-rose-50 text-rose-900',
  pa: 'bg-amber-50 text-amber-950',
};
