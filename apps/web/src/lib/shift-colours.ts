/// The colours a shift wears, shared by the week and the month so the two agree:
/// its office fills it, its job role outlines it (Dominguez, 30 September 2026).

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

/// The inline colours of a shift's chip: the office tints the inside, the job
/// role draws the outline. A shift with no role is outlined in its office's
/// colour. An open shift keeps its amber inside and takes only the outline.
/// A draft is dashed by its callers and a shade lighter here.
export function shiftChipStyle({
  base,
  roleColour,
  open,
  draft,
}: {
  base: string;
  roleColour: string | null;
  open: boolean;
  draft: boolean;
}): { backgroundColor?: string; borderColor: string } {
  const borderColor = roleColour ?? (open ? '#d97706' : base);
  return open ? { borderColor } : { backgroundColor: tint(base, draft ? '14' : '33'), borderColor };
}
