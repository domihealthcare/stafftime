import { VendorPaymentMethod, VendorPaymentStatus } from '@prisma/client';
import { paymentFields } from './vendors.service';

const base = {
  forWhat: ' September 2025 ',
  method: VendorPaymentMethod.CHECK,
  checkNumber: ' 1486 ',
  amount: 3900,
  status: VendorPaymentStatus.TO_PAY,
};

describe('paymentFields', () => {
  it('keeps what was typed, trimmed', () => {
    expect(paymentFields({ ...base, invoiceNumber: ' 20250608108 ' })).toMatchObject({
      forWhat: 'September 2025',
      invoiceNumber: '20250608108',
      checkNumber: '1486',
      amount: 3900,
      sentOn: null,
      completedOn: null,
    });
  });

  it('keeps no check number on cash', () => {
    expect(paymentFields({ ...base, method: VendorPaymentMethod.CASH }).checkNumber).toBeNull();
  });

  it('needs the day it cleared once completed, and the day sent is optional', () => {
    expect(paymentFields({ ...base, status: VendorPaymentStatus.SENT }).sentOn).toBeNull();
    expect(() =>
      paymentFields({ ...base, status: VendorPaymentStatus.COMPLETED, sentOn: '2025-10-21' }),
    ).toThrow(/completed/);
    expect(
      paymentFields({
        ...base,
        status: VendorPaymentStatus.COMPLETED,
        sentOn: '2025-10-21',
        completedOn: '2025-10-28',
      }),
    ).toMatchObject({
      sentOn: new Date('2025-10-21T00:00:00.000Z'),
      completedOn: new Date('2025-10-28T00:00:00.000Z'),
    });
  });

  it('refuses a payment completed before it was sent', () => {
    expect(() =>
      paymentFields({
        ...base,
        status: VendorPaymentStatus.COMPLETED,
        sentOn: '2025-10-28',
        completedOn: '2025-10-21',
      }),
    ).toThrow(/before it was sent/);
  });

  it('keeps the day sent whatever the status, but a day completed only once completed', () => {
    expect(
      paymentFields({ ...base, sentOn: '2025-10-21', completedOn: '2025-10-28' }),
    ).toMatchObject({ sentOn: new Date('2025-10-21T00:00:00.000Z'), completedOn: null });
  });
});
