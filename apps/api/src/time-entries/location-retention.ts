/**
 * How long a punch keeps the coordinates and the IP it was made from.
 *
 * Capturing them is what makes a browser clock-in mean anything: without them
 * "I clocked in at 9" is just a claim. But their usefulness has a short half
 * life. A disputed punch is disputed within a pay period or two — after that
 * the hours are paid, the timesheet is approved and nobody is going back. What
 * is left is a map of where each member of staff was on each morning for as
 * long as the app runs, which is not something a practice needs and is very
 * much something it could lose.
 *
 * Ninety days covers a dispute comfortably — two months of pay runs and then
 * some — and is short enough that the standing record stays small.
 *
 * What survives the sweep is the punch itself: the time, the location it was
 * attributed to, and what the geofence or IP check concluded at the time
 * (`clockInVerification`). So "was this punch verified?" is answerable forever;
 * "exactly where were they standing?" is answerable for a quarter.
 */
export const LOCATION_RETENTION_DAYS = 90;

/// The timestamp before which coordinates should no longer exist.
export function locationRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - LOCATION_RETENTION_DAYS * 86_400_000);
}

/// Whether a punch is old enough that the nightly sweep should have cleared it.
export function isPastLocationRetention(at: Date, now = new Date()): boolean {
  return at < locationRetentionCutoff(now);
}
