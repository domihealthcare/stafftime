/**
 * The plain parts of an invoice, kept apart from lib/invoice-pdf.ts so the
 * Invoices list can use them without loading the PDF library (pdf-lib, about
 * 430 kB) until somebody presses Download. invoice-pdf.ts re-exports them.
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
    'angelica@domihealthcare.com',
    '201-528-3664',
  ],
  payableTo: 'DOMI HEALTHCARE LLC',
  questions:
    'If you have any questions or concerns regarding this invoice, please contact our office via phone 201-528-3664 or via email angelica@domihealthcare.com.',
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

export const invoiceNumberLabel = (number: number) => `#${String(number).padStart(3, '0')}`;

export const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/// "Invoice 001.pdf": nothing about who it is to, a patient least of all.
export const invoiceFilename = (number: number) => `Invoice ${String(number).padStart(3, '0')}.pdf`;
