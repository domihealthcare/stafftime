import { LineCapStyle, PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from 'pdf-lib';
import { anchorAt, lineStarts, type PageShape } from './geometry';

/**
 * Writes what was placed on the pages into a copy of the PDF (November
 * 2026), here in the browser. The PDF opened is never sent anywhere: this
 * reads its bytes from this page's memory and hands back new ones to
 * download.
 *
 * Everything is measured as shown on screen, in points from the top-left of
 * the page (`geometry.ts`), and drawn into the page itself, so it prints and
 * goes into eCW like the rest of the page.
 */

interface PlacedBase {
  id: string;
  /// Which page, from 0.
  page: number;
  /// The top-left corner as shown, in points.
  x: number;
  y: number;
}

export interface PlacedText extends PlacedBase {
  kind: 'text';
  text: string;
  /// Font size in points.
  size: number;
}

export interface PlacedTick extends PlacedBase {
  kind: 'tick';
  /// The tick's box, square, in points.
  size: number;
}

export interface PlacedStamp extends PlacedBase {
  kind: 'stamp';
  width: number;
  height: number;
  /// The signature, a PNG as a data: URL.
  image: string;
  /// Whose signature, as it reads before "signature": "your", "Dr. Lee’s".
  label: string;
}

export type Placed = PlacedText | PlacedTick | PlacedStamp;

/// A tick, drawn as a line in a 24-unit box.
export const TICK_PATH = 'M 3 13 L 9 19 L 21 5';

const INK = rgb(0.05, 0.05, 0.1);

export class UnreadablePdf extends Error {}

/// The text without the few characters the PDF's standard font cannot
/// write (emoji, say); accents, quotes and dashes are kept.
export function writable(font: Pick<PDFFont, 'encodeText'>, text: string): string {
  return [...text]
    .filter((character) => {
      if (character === '\n') return true;
      try {
        font.encodeText(character);
        return true;
      } catch {
        return false;
      }
    })
    .join('');
}

function bytesOf(dataUrl: string): Uint8Array {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

export async function writePdf(
  original: Uint8Array,
  pages: PageShape[],
  placed: Placed[],
): Promise<Uint8Array> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(original);
  } catch (error) {
    throw new UnreadablePdf(
      error instanceof Error && /encrypt/i.test(error.message)
        ? 'This PDF is locked against changes, so it cannot be filled in here. Ask whoever sent it for an unlocked copy.'
        : 'This PDF could not be read to write into it.',
    );
  }
  const font = await document.embedFont(StandardFonts.Helvetica);
  const images = new Map<string, Awaited<ReturnType<PDFDocument['embedPng']>>>();
  const docPages = document.getPages();

  for (const item of placed) {
    const page = docPages[item.page];
    const shape = pages[item.page];
    if (!page || !shape) continue;
    if (item.kind === 'text') {
      const lines = writable(font, item.text).split('\n');
      lineStarts(item.x, item.y, item.size, lines.length).forEach((start, line) => {
        if (!lines[line].trim()) return;
        const anchor = anchorAt(shape, start.x, start.y);
        page.drawText(lines[line], {
          x: anchor.x,
          y: anchor.y,
          rotate: degrees(anchor.rotate),
          size: item.size,
          font,
          color: INK,
        });
      });
    } else if (item.kind === 'tick') {
      // An SVG path is drawn from its top-left corner, downwards.
      const anchor = anchorAt(shape, item.x, item.y);
      page.drawSvgPath(TICK_PATH, {
        x: anchor.x,
        y: anchor.y,
        rotate: degrees(anchor.rotate),
        scale: item.size / 24,
        borderColor: INK,
        borderWidth: 2.5,
        borderLineCap: LineCapStyle.Round,
      });
    } else {
      let image = images.get(item.image);
      if (!image) {
        image = await document.embedPng(bytesOf(item.image));
        images.set(item.image, image);
      }
      const anchor = anchorAt(shape, item.x, item.y + item.height);
      page.drawImage(image, {
        x: anchor.x,
        y: anchor.y,
        rotate: degrees(anchor.rotate),
        width: item.width,
        height: item.height,
      });
    }
  }
  return document.save();
}
