/**
 * Where something placed on a page of a PDF lands in the PDF itself (November
 * 2026). Pure, so it is tested on its own.
 *
 * On screen a page is shown the way a reader sees it: turned the right way up
 * (a PDF page can be stored on its side, with a /Rotate) and measured from
 * its top-left corner, in PDF points (1/72 inch) at 100%. pdf.js says how
 * that view relates to the page's own coordinates, which run from the
 * bottom-left and upwards, with a transform; this turns a spot on screen back
 * into the page's coordinates, and says how far to turn what is drawn there
 * so it reads the right way up too.
 */

/// pdf.js's viewport transform at scale 1: [a, b, c, d, e, f], taking a
/// point (x, y) on the page to (a x + c y + e, b x + d y + f) on screen.
export type Transform = [number, number, number, number, number, number];

export interface PageShape {
  /// Width and height as shown (after any rotation), in points.
  width: number;
  height: number;
  /// The page's /Rotate, 0, 90, 180 or 270: clockwise, as shown.
  rotation: number;
  transform: Transform;
}

/// The point on the page under a spot on screen (points from the top-left
/// of the page as shown).
export function toPagePoint(transform: Transform, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = transform;
  const det = a * d - b * c;
  const dx = x - e;
  const dy = y - f;
  // `+ 0` turns -0 into 0.
  return { x: (d * dx - c * dy) / det + 0, y: (a * dy - b * dx) / det + 0 };
}

/// Where to draw something whose bottom-left corner, as shown, is at (x, y)
/// on screen, and how far to turn it (anticlockwise, in degrees, as pdf-lib
/// takes it) so that it reads the right way up as shown.
export function anchorAt(page: PageShape, x: number, y: number) {
  const point = toPagePoint(page.transform, x, y);
  return { x: point.x, y: point.y, rotate: ((page.rotation % 360) + 360) % 360 };
}

/// How tall a line of typed text is, as a share of its size, on screen and
/// in the PDF alike.
export const LINE_HEIGHT = 1.2;
/// Where the text sits on its line: the baseline, as a share of its size
/// below the top of the line (Helvetica, in a 1.2 line).
export const BASELINE = 0.95;

/// The start of each line of typed text placed with its top-left corner at
/// (x, y) as shown: where its baseline begins on screen.
export function lineStarts(x: number, y: number, size: number, lines: number) {
  return Array.from({ length: lines }, (_, line) => ({
    x,
    y: y + (line * LINE_HEIGHT + BASELINE) * size,
  }));
}

/// Keeps something on the page as shown: its top-left corner moved so that
/// all of it stays inside.
export function keepOnPage(
  page: Pick<PageShape, 'width' | 'height'>,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return {
    x: Math.min(Math.max(0, x), Math.max(0, page.width - width)),
    y: Math.min(Math.max(0, y), Math.max(0, page.height - height)),
  };
}

/// "11/03/2026": today's date for a form, as the practice writes it.
export function todayForForm(now = new Date()): string {
  return now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

/// The file name to download as: the one it came with, marked as signed.
/// The name stays on this computer, as the file does.
export function signedName(original: string): string {
  const base = original.replace(/\.pdf$/i, '').trim() || 'Document';
  return `${base} (signed).pdf`;
}
