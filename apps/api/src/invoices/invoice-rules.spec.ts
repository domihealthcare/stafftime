import { InvoiceBillTo } from '@prisma/client';
import { invoiceNumberLabel, invoiceProblem, payeeProblem } from './invoice-rules';

describe('invoice rules', () => {
  const base = { issuedOn: '2026-10-05' };

  it("refuses a patient's name or address: they stay on the PDF", () => {
    expect(
      invoiceProblem({ ...base, billTo: InvoiceBillTo.PATIENT, billToName: 'Jane Doe' }),
    ).toMatch(/never saved/);
    expect(
      invoiceProblem({ ...base, billTo: InvoiceBillTo.PATIENT, billToAddress: '1 Main St' }),
    ).toMatch(/never saved/);
    expect(invoiceProblem({ ...base, billTo: InvoiceBillTo.PATIENT })).toBeNull();
  });

  it('needs a name for a vendor', () => {
    expect(invoiceProblem({ ...base, billTo: InvoiceBillTo.VENDOR })).toMatch(/Who/);
    expect(
      invoiceProblem({ ...base, billTo: InvoiceBillTo.VENDOR, billToName: 'Acme Labs' }),
    ).toBeNull();
  });

  it('refuses a due date before the invoice date', () => {
    expect(
      invoiceProblem({
        ...base,
        billTo: InvoiceBillTo.VENDOR,
        billToName: 'Acme',
        dueOn: '2026-10-01',
      }),
    ).toMatch(/before/);
  });

  it('numbers invoices as the template did', () => {
    expect(invoiceNumberLabel(1)).toBe('#001');
    expect(invoiceNumberLabel(42)).toBe('#042');
    expect(invoiceNumberLabel(1234)).toBe('#1234');
  });

  it('needs a name and who checks are payable to for a pay-to', () => {
    expect(payeeProblem({ name: '', payableTo: 'X' })).toMatch(/name/);
    expect(payeeProblem({ name: 'Dr. A', payableTo: '  ' })).toMatch(/payable/);
    expect(payeeProblem({ name: 'Dr. A', payableTo: 'DR. A' })).toBeNull();
  });
});
