/**
 * Feet in, metres out.
 *
 * The app talks to people in feet and does its arithmetic in metres. Both units
 * exist on purpose and the conversion lives in one place, because a stray
 * `* 3.28` somewhere in the geofence check is a bug that only shows up as staff
 * being refused at their own front desk.
 */
const FEET_PER_METRE = 3.28084;

export function feetToMetres(feet: number): number {
  return feet / FEET_PER_METRE;
}

export function metresToFeet(metres: number): number {
  return metres * FEET_PER_METRE;
}

/// For anything shown to a person. Whole feet: nobody is served by "492.13 ft".
export function metresToWholeFeet(metres: number): number {
  return Math.round(metresToFeet(metres));
}
