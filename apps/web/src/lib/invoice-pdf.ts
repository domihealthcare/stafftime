import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { printable } from '../clinical/common/printable';

/**
 * An invoice as a PDF, laid out like the practice's Invoice Template sheet
 * (October 2026, Dominguez): the practice top left, INVOICE top right, who it
 * is to, the number and dates, the lines and their total, whether it is paid,
 * and the terms. Drawn in the browser.
 *
 * For a patient the name, date of birth and address are passed in from what
 * was typed on the screen, never from the server, which does not have them.
 * Without them (a copy downloaded later) the bill-to box says they were not
 * kept: the blanked-out copy Dominguez asked for.
 */

export interface InvoiceForPdf {
  number: number;
  issuedOn: string;
  dueOn: string | null;
  status: 'DUE' | 'PAID';
  paidOn: string | null;
  note: string | null;
  lines: { description: string; amountCents: number }[];
  /// Who it is paid to; null for the practice.
  payTo: PayTo | null;
  billTo:
    | { kind: 'VENDOR'; name: string; address: string }
    | { kind: 'PATIENT'; name: string; dob: string; address: string }
    | { kind: 'PATIENT_WITHHELD' };
}

export const PRACTICE = {
  name: 'Domi Healthcare LLC',
  lines: [
    '7919 John F. Kennedy Blvd',
    'North Bergen, NJ 07047',
    'info@domihealthcare.com',
    '201-528-3664',
  ],
  payableTo: 'DOMI HEALTHCARE LLC',
  questions:
    'If you have any questions or concerns regarding this invoice, please contact our office via phone 201-528-3664 or via email office@domihealthcare.com.',
};

/// Who an invoice is paid to: the practice, or a saved option such as a
/// provider paid directly (October 2026, Dominguez).
export interface PayTo {
  name: string;
  /// Address, email and phone, one per line.
  lines: string[];
  payableTo: string;
}

export const PRACTICE_PAY_TO: PayTo = {
  name: PRACTICE.name,
  lines: PRACTICE.lines,
  payableTo: PRACTICE.payableTo,
};

export const WITHHELD = "A patient's details are not kept in Domi Staff.";

const WIDTH = 612;
const HEIGHT = 792;
const LEFT = 54;
const RIGHT = WIDTH - 54;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.38, 0.42, 0.48);
const RULE = rgb(0.8, 0.83, 0.86);
const BRAND = rgb(0x3a / 255, 0x68 / 255, 0x88 / 255);
const SHADE = rgb(0.95, 0.96, 0.97);

export const invoiceNumberLabel = (number: number) => `#${String(number).padStart(3, '0')}`;

export const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

/// "Invoice 001.pdf": nothing about who it is to, a patient least of all.
export const invoiceFilename = (number: number) => `Invoice ${String(number).padStart(3, '0')}.pdf`;

export async function invoicePdf(invoice: InvoiceForPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${invoiceNumberLabel(invoice.number)}`);
  doc.setCreator('Domi Staff');
  doc.setProducer('Domi Staff');
  const [regular, bold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);
  let page = doc.addPage([WIDTH, HEIGHT]);

  const text = (
    target: PDFPage,
    value: string,
    x: number,
    y: number,
    options: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      right?: boolean;
    } = {},
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? 10;
    const clean = printable(value);
    const width = font.widthOfTextAtSize(clean, size);
    target.drawText(clean, {
      x: options.right ? x - width : x,
      y,
      size,
      font,
      color: options.color ?? INK,
    });
  };
  const wrap = (value: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const paragraph of printable(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  };

  // The logo, from the app's own files; the invoice still works without it.
  let top = HEIGHT - 54;
  try {
    const response = await fetch('/brand/domi-healthcare-slogan-black.png');
    if (response.ok) {
      const image = await doc.embedPng(await response.arrayBuffer());
      const width = 130;
      const height = (image.height / image.width) * width;
      page.drawImage(image, { x: LEFT, y: top - height, width, height });
      top -= height + 16;
    }
  } catch {
    // No logo: the practice's name below says who it is from.
  }
  text(page, 'INVOICE', RIGHT, HEIGHT - 80, { font: bold, size: 26, color: BRAND, right: true });

  // Who it is from and paid to: the practice unless another was chosen.
  const payTo = invoice.payTo ?? PRACTICE_PAY_TO;
  let y = top - 4;
  text(page, payTo.name, LEFT, y, { font: bold, size: 11 });
  for (const line of payTo.lines.flatMap((one) => wrap(one, regular, 10, 300))) {
    if (!line) continue;
    y -= 14;
    text(page, line, LEFT, y, { color: MUTED });
  }

  // Who it is to, and the number and dates.
  y -= 34;
  const boxTop = y;
  text(page, 'BILL TO', LEFT, y, { font: bold, size: 9, color: BRAND });
  y -= 15;
  if (invoice.billTo.kind === 'PATIENT_WITHHELD') {
    page.drawRectangle({ x: LEFT, y: y - 22, width: 260, height: 32, color: SHADE });
    text(page, 'Patient', LEFT + 8, y - 2, { font: bold });
    text(page, WITHHELD, LEFT + 8, y - 15, { size: 8.5, color: MUTED });
    y -= 30;
  } else {
    text(page, invoice.billTo.name, LEFT, y, { font: bold, size: 11 });
    if (invoice.billTo.kind === 'PATIENT' && invoice.billTo.dob) {
      y -= 14;
      text(page, `Date of birth: ${usDate(invoice.billTo.dob)}`, LEFT, y);
    }
    for (const line of wrap(invoice.billTo.address, regular, 10, 260)) {
      if (!line) continue;
      y -= 14;
      text(page, line, LEFT, y);
    }
  }
  const facts: [string, string][] = [
    ['Invoice No:', invoiceNumberLabel(invoice.number)],
    ['Invoice Date:', usDate(invoice.issuedOn)],
    ['Due Date:', invoice.dueOn ? usDate(invoice.dueOn) : 'On receipt'],
  ];
  let factY = boxTop;
  for (const [label, value] of facts) {
    text(page, label, RIGHT - 110, factY, { font: bold, size: 9.5, right: true });
    text(page, value, RIGHT, factY, { right: true });
    factY -= 15;
  }
  y = Math.min(y, factY) - 30;

  // The lines.
  const amountX = RIGHT - 8;
  const descriptionWidth = RIGHT - LEFT - 130;
  page.drawRectangle({ x: LEFT, y: y - 6, width: RIGHT - LEFT, height: 22, color: BRAND });
  text(page, 'DESCRIPTION', LEFT + 8, y, { font: bold, size: 9.5, color: rgb(1, 1, 1) });
  text(page, 'TOTAL', amountX, y, { font: bold, size: 9.5, color: rgb(1, 1, 1), right: true });
  y -= 26;
  for (const line of invoice.lines) {
    const rows = wrap(line.description, regular, 10, descriptionWidth);
    if (y - rows.length * 13 < 170) {
      page = doc.addPage([WIDTH, HEIGHT]);
      y = HEIGHT - 72;
    }
    rows.forEach((row, index) => text(page, row, LEFT + 8, y - index * 13));
    text(page, dollars(line.amountCents), amountX, y, { right: true });
    y -= rows.length * 13 + 8;
    page.drawLine({
      start: { x: LEFT, y: y + 4 },
      end: { x: RIGHT, y: y + 4 },
      thickness: 0.5,
      color: RULE,
    });
  }

  const total = invoice.lines.reduce((sum, line) => sum + line.amountCents, 0);
  y -= 14;
  text(page, 'TOTAL', RIGHT - 110, y, { font: bold, size: 11, right: true });
  text(page, dollars(total), amountX, y, { font: bold, size: 11, right: true });
  y -= 18;
  const balance =
    invoice.status === 'PAID'
      ? `Balance PAID${invoice.paidOn ? ` on ${usDate(invoice.paidOn)}` : ''}`
      : `Balance due: ${dollars(total)}`;
  text(page, balance, amountX, y, {
    font: bold,
    size: 10,
    color: invoice.status === 'PAID' ? rgb(0.06, 0.45, 0.3) : rgb(0.7, 0.15, 0.15),
    right: true,
  });

  if (invoice.note) {
    y -= 26;
    for (const line of wrap(invoice.note, regular, 10, RIGHT - LEFT)) {
      text(page, line, LEFT, y);
      y -= 13;
    }
  }

  // The terms, at the foot of the last page.
  let foot = 150;
  if (y < foot + 40) {
    page = doc.addPage([WIDTH, HEIGHT]);
  }
  page.drawLine({
    start: { x: LEFT, y: foot + 18 },
    end: { x: RIGHT, y: foot + 18 },
    thickness: 0.5,
    color: RULE,
  });
  text(page, 'Terms & Instructions', LEFT, foot, { font: bold, size: 10, color: BRAND });
  foot -= 16;
  text(page, 'Make all checks payable to:', LEFT, foot);
  text(page, payTo.payableTo, LEFT + 140, foot, { font: bold });
  foot -= 22;
  for (const line of wrap(PRACTICE.questions, regular, 9.5, RIGHT - LEFT)) {
    text(page, line, LEFT, foot, { size: 9.5, color: MUTED });
    foot -= 12;
  }
  foot -= 14;
  const thanks = 'THANK YOU FOR YOUR BUSINESS!';
  text(page, thanks, (WIDTH - bold.widthOfTextAtSize(thanks, 11)) / 2, foot, {
    font: bold,
    size: 11,
    color: BRAND,
  });

  return doc.save();
}
