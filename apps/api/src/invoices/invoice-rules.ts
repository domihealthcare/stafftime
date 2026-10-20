import { InvoiceBillTo } from '@prisma/client';

/**
 * What an invoice may be saved with (October 2026, Dominguez: "usually these
 * are not for patients, these are for vendors - but we do need to keep copies
 * of the invoice - is there an option that can mark as PHI present and then
 * utilize some sort of censorship?"). Pure, so it is tested on its own.
 *
 * Ticked as for a patient, nothing that names them is kept: their name, date
 * of birth and address are typed in the browser and printed on the PDF only,
 * and the saved copy shows them blanked out. The lines (what was paid for)
 * are kept, so the screen asks that no name goes in them.
 */
export function invoiceProblem(input: {
  billTo: InvoiceBillTo;
  billToName?: string;
  billToAddress?: string;
  issuedOn: string;
  dueOn?: string | null;
}): string | null {
  const named = (input.billToName ?? '').trim() !== '' || (input.billToAddress ?? '').trim() !== '';
  if (input.billTo === InvoiceBillTo.PATIENT && named) {
    return "A patient's details are printed on the PDF only, never saved. Send the invoice without them.";
  }
  if (input.billTo === InvoiceBillTo.VENDOR && (input.billToName ?? '').trim() === '') {
    return 'Who is the invoice to?';
  }
  if (input.dueOn && input.dueOn < input.issuedOn) {
    return 'The due date is before the invoice date.';
  }
  return null;
}

/// "#001", "#042", "#1234".
export const invoiceNumberLabel = (number: number) => `#${String(number).padStart(3, '0')}`;
