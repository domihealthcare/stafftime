import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { printable } from '../printable';

/**
 * A small page-layout helper on top of pdf-lib: text that wraps, pages that
 * break, and a header and footer stamped on every page once the number of
 * pages is known ("Page 2 of 5").
 *
 * Everything is drawn as real text in Helvetica — never a picture of a page —
 * so the PDF's words can be selected, searched and read by eCW.
 */

/// US Letter, in points (72 to the inch).
const WIDTH = 612;
const HEIGHT = 792;
const LEFT = 54;
const RIGHT = WIDTH - 54;
const TOP = HEIGHT - 104;
const BOTTOM = 64;
const CONTENT = RIGHT - LEFT;
/// The label column of a label-and-answer row.
const LABEL_WIDTH = 150;

const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.38, 0.42, 0.48);
const RULE = rgb(0.75, 0.78, 0.82);
const BRAND = rgb(0x3a / 255, 0x68 / 255, 0x88 / 255);

export interface PageStamp {
  /// Bold, top left of every page.
  title: string;
  /// Beneath it — the patient's line.
  lines: string[];
  /// Bottom of every page.
  footer: string;
  /// "Page 2 of 5" by default; the Spanish handout passes its own.
  pageLabel?: (page: number, pages: number) => string;
}

export class PdfWriter {
  private page!: PDFPage;
  private y = TOP;

  private constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  /// `title` goes in the file's properties. Keep patient details out of it:
  /// they are on the pages, where they belong.
  static async create(title: string): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    doc.setTitle(title);
    doc.setCreator('Domi Staff');
    doc.setProducer('Domi Staff');
    const [regular, bold] = await Promise.all([
      doc.embedFont(StandardFonts.Helvetica),
      doc.embedFont(StandardFonts.HelveticaBold),
    ]);
    return new PdfWriter(doc, regular, bold);
  }

  // ---------------------------------------------------------------- content

  title(text: string) {
    this.block(text, { font: this.bold, size: 15, color: BRAND, after: 4 });
  }

  /// A section heading with a rule under it, never left alone at the foot of a
  /// page.
  heading(text: string) {
    this.ensure(64);
    this.y -= 10;
    this.block(text, { font: this.bold, size: 12, color: BRAND, after: 2 });
    this.page.drawLine({
      start: { x: LEFT, y: this.y + 2 },
      end: { x: RIGHT, y: this.y + 2 },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= 6;
  }

  subheading(text: string, size = 10) {
    this.ensure(36);
    this.y -= 4;
    this.block(text, { font: this.bold, size, after: 2 });
  }

  paragraph(text: string, options: { muted?: boolean; size?: number; indent?: number } = {}) {
    this.block(text, {
      font: this.regular,
      size: options.size ?? 10,
      color: options.muted ? MUTED : INK,
      indent: options.indent ?? 0,
      after: 4,
    });
  }

  /// A label and its answer side by side, each wrapping in its own column.
  field(label: string, value: string) {
    const size = 10;
    const leading = size * 1.3;
    const labelLines = this.wrap(`${label}`, this.bold, size, LABEL_WIDTH - 10);
    const valueLines = this.wrap(value, this.regular, size, CONTENT - LABEL_WIDTH);
    const rows = Math.max(labelLines.length, valueLines.length);
    // A short answer stays in one piece; a long one may run on to the next page.
    if (rows <= 6) this.ensure(rows * leading);
    for (let row = 0; row < rows; row++) {
      this.ensure(leading);
      this.y -= size;
      if (labelLines[row]) this.draw(labelLines[row], LEFT, this.bold, size, INK);
      if (valueLines[row]) this.draw(valueLines[row], LEFT + LABEL_WIDTH, this.regular, size, INK);
      this.y -= leading - size;
    }
    this.y -= 3;
  }

  bullets(items: string[], indent = 0, size = 10) {
    for (const item of items) {
      const lines = this.wrap(item, this.regular, size, CONTENT - indent - 12);
      lines.forEach((line, index) => {
        this.ensure(size * 1.3);
        this.y -= size;
        if (index === 0) this.draw('•', LEFT + indent, this.regular, size, INK);
        this.draw(line, LEFT + indent + 12, this.regular, size, INK);
        this.y -= size * 0.3;
      });
    }
    this.y -= 3;
  }

  gap(points: number) {
    this.y -= points;
  }

  /// Starts a new page unless `points` more fit on this one — to keep a short
  /// block, like the attestation and its signature line, in one piece.
  keep(points: number) {
    this.ensure(points);
  }

  /// Keeps a group of label-and-answer rows (with a subheading over them) on
  /// one page, when the group is short enough to fit on one.
  keepFields(rows: [string, string][]) {
    const leading = 10 * 1.3;
    const height =
      36 +
      rows.reduce((total, [label, value]) => {
        const lines = Math.max(
          this.wrap(label, this.bold, 10, LABEL_WIDTH - 10).length,
          this.wrap(value, this.regular, 10, CONTENT - LABEL_WIDTH).length,
        );
        return total + lines * leading + 3;
      }, 0);
    if (height < (TOP - BOTTOM) / 2) this.ensure(height);
  }

  /// "Signature: ______" with room to sign above the line.
  signatureLine(label: string) {
    this.ensure(44);
    this.y -= 34;
    this.draw(label, LEFT, this.bold, 10, INK);
    const start = LEFT + this.bold.widthOfTextAtSize(label, 10) + 8;
    this.page.drawLine({
      start: { x: start, y: this.y - 2 },
      end: { x: Math.min(start + 260, RIGHT), y: this.y - 2 },
      thickness: 0.8,
      color: INK,
    });
    this.y -= 8;
  }

  // ------------------------------------------------------------ finishing

  /// Stamps the header and footer on every page, then hands back the file.
  async finish(stamp: PageStamp): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      const pageLabel = stamp.pageLabel
        ? stamp.pageLabel(index + 1, pages.length)
        : `Page ${index + 1} of ${pages.length}`;
      const top = HEIGHT - 40;
      const labelWidth = this.regular.widthOfTextAtSize(pageLabel, 9);
      const titleLine = this.fit(stamp.title, this.bold, 10, CONTENT - labelWidth - 16);
      page.drawText(titleLine, { x: LEFT, y: top, size: 10, font: this.bold, color: BRAND });
      page.drawText(pageLabel, {
        x: RIGHT - labelWidth,
        y: top,
        size: 9,
        font: this.regular,
        color: INK,
      });
      let y = top - 15;
      for (const line of stamp.lines.flatMap((l) => this.wrap(l, this.regular, 9, CONTENT))) {
        page.drawText(line, { x: LEFT, y, size: 9, font: this.regular, color: INK });
        y -= 12;
      }
      page.drawLine({
        start: { x: LEFT, y: y + 4 },
        end: { x: RIGHT, y: y + 4 },
        thickness: 0.8,
        color: RULE,
      });

      page.drawLine({
        start: { x: LEFT, y: 48 },
        end: { x: RIGHT, y: 48 },
        thickness: 0.6,
        color: RULE,
      });
      let footerY = 36;
      for (const line of this.wrap(stamp.footer, this.regular, 8, CONTENT)) {
        page.drawText(line, { x: LEFT, y: footerY, size: 8, font: this.regular, color: MUTED });
        footerY -= 10;
      }
    });
    return this.doc.save();
  }

  // ------------------------------------------------------------- plumbing

  private newPage() {
    this.page = this.doc.addPage([WIDTH, HEIGHT]);
    this.y = TOP;
  }

  /// Starts a new page unless `height` more points fit on this one.
  private ensure(height: number) {
    if (this.y - height < BOTTOM) this.newPage();
  }

  private block(
    text: string,
    options: {
      font: PDFFont;
      size: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      after?: number;
    },
  ) {
    const { font, size, color = INK, indent = 0, after = 0 } = options;
    const leading = size * 1.3;
    for (const line of this.wrap(text, font, size, CONTENT - indent)) {
      this.ensure(leading);
      this.y -= size;
      this.draw(line, LEFT + indent, font, size, color);
      this.y -= leading - size;
    }
    this.y -= after;
  }

  private draw(
    text: string,
    x: number,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb>,
  ) {
    this.page.drawText(text, { x, y: this.y, size, font, color });
  }

  /// One line, shortened with "…" if it will not fit.
  private fit(text: string, font: PDFFont, size: number, width: number): string {
    const clean = printable(text);
    if (font.widthOfTextAtSize(clean, size) <= width) return clean;
    let cut = clean;
    while (cut && font.widthOfTextAtSize(`${cut}…`, size) > width) cut = cut.slice(0, -1);
    return `${cut}…`;
  }

  /// Breaks text into lines that fit `width`, keeping the line breaks that
  /// were typed and splitting a word only if it is wider than a whole line.
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    const fits = (candidate: string) => font.widthOfTextAtSize(candidate, size) <= width;
    for (const paragraph of printable(text).split('\n')) {
      const words = paragraph.split(' ').filter((word) => word !== '');
      if (words.length === 0) {
        lines.push('');
        continue;
      }
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (fits(candidate)) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        if (fits(word)) {
          line = word;
          continue;
        }
        // A word wider than the line: break it wherever it runs out.
        let piece = '';
        for (const char of word) {
          if (fits(piece + char)) piece += char;
          else {
            lines.push(piece);
            piece = char;
          }
        }
        line = piece;
      }
      lines.push(line);
    }
    // Blank lines at the very end add nothing.
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }
}
