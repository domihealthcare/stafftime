/// The colours a shift wears, shared by the week and the month so the two agree:
/// its office as the tint, its job role as the stripe on the left.

/// Location marks, in the order the colour-blind-checked palette validates them.
/// Offices take these in order, so they do not depend on what the office is called.
const LOCATION_COLOURS = ['#2a78d6', '#eb6834', '#1baf7a', '#e87ba4', '#008300', '#4a3aa7'];

/// Working from home wears the palette's violet, apart from both offices.
export const REMOTE_COLOUR = '#4a3aa7';

/// A colour at low strength, as a background tint behind dark text.
export const tint = (hex: string, alpha: string) => `${hex}${alpha}`;

/// The colour of an office, by its place in the list of offices.
export function locationColourFn(locations: { id: string }[]): (id: string) => string {
  const map = new Map(
    locations.map((location, i) => [location.id, LOCATION_COLOURS[i % LOCATION_COLOURS.length]]),
  );
  return (id) => map.get(id) ?? '#94a3b8';
}
