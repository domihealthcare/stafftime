/**
 * The colours a job role can wear, by key.
 *
 * A fixed set rather than any hex: these are a categorical palette validated
 * for colour-blind readers in this order, so the first few roles — the ones
 * seen together most — stay tellable apart. The web app maps each key to its
 * hex (`apps/web/src/lib/job-role-colours.ts`); keep the two lists in step.
 */
export const JOB_ROLE_COLOURS = [
  'blue',
  'orange',
  'aqua',
  'yellow',
  'magenta',
  'green',
  'violet',
  'red',
] as const;

export type JobRoleColour = (typeof JOB_ROLE_COLOURS)[number];

/// The first colour no role is wearing yet, or — once all eight are taken —
/// the one worn by the fewest, so a ninth role doubles up as little as it can.
export function nextFreeColour(inUse: string[]): JobRoleColour {
  const counts = new Map<string, number>(JOB_ROLE_COLOURS.map((colour) => [colour, 0]));
  for (const colour of inUse) {
    if (counts.has(colour)) counts.set(colour, counts.get(colour)! + 1);
  }
  let best: JobRoleColour = JOB_ROLE_COLOURS[0];
  for (const colour of JOB_ROLE_COLOURS) {
    if (counts.get(colour)! < counts.get(best)!) best = colour;
  }
  return best;
}
