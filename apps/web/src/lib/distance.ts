/// Feet in, metres out — the mirror of `apps/api/src/common/util/distance.util.ts`.
/// The radius is stored and entered in feet; the browser reports GPS accuracy
/// and the great-circle helper returns metres.
const FEET_PER_METRE = 3.28084;

export function metresToWholeFeet(metres: number): number {
  return Math.round(metres * FEET_PER_METRE);
}
