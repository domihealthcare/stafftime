/**
 * The colours a job role can wear.
 *
 * A fixed set of eight rather than any colour at all: these are the reference
 * categorical palette, validated for colour-blind readers in this order, so
 * neighbouring roles stay tellable apart. The server stores the key and
 * refuses anything else, so a role cannot end up a colour nobody can read.
 *
 * The colour is only ever a dot or a stripe beside the role's name — the
 * name itself stays in slate. Three of these sit below 3:1 on white, which is
 * fine for a mark next to a label and not fine for the label.
 *
 * Kept in step with `JOB_ROLE_COLOURS` in the API.
 */
export const JOB_ROLE_COLOURS = {
  blue: { label: 'Blue', hex: '#2a78d6' },
  orange: { label: 'Orange', hex: '#eb6834' },
  aqua: { label: 'Aqua', hex: '#1baf7a' },
  yellow: { label: 'Yellow', hex: '#eda100' },
  magenta: { label: 'Pink', hex: '#e87ba4' },
  green: { label: 'Green', hex: '#008300' },
  violet: { label: 'Violet', hex: '#4a3aa7' },
  red: { label: 'Red', hex: '#e34948' },
} as const;

export type JobRoleColour = keyof typeof JOB_ROLE_COLOURS;

export const JOB_ROLE_COLOUR_KEYS = Object.keys(JOB_ROLE_COLOURS) as JobRoleColour[];

export function jobRoleHex(colour: string | null | undefined): string {
  return JOB_ROLE_COLOURS[colour as JobRoleColour]?.hex ?? '#94a3b8';
}
