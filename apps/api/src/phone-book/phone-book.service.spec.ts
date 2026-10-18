import { contactFields } from './phone-book.service';

describe('contactFields', () => {
  it('keeps what was typed, trimmed', () => {
    expect(
      contactFields({
        category: ' Labs ',
        name: ' Quest Diagnostic Lab ',
        phone: ' 1-866-697-8378 ',
        notes: ' Specimen pick-up 1-800-223-0570 ',
      }),
    ).toEqual({
      category: 'Labs',
      name: 'Quest Diagnostic Lab',
      phone: '1-866-697-8378',
      fax: null,
      address: null,
      email: null,
      website: null,
      notes: 'Specimen pick-up 1-800-223-0570',
    });
  });

  it('keeps an emptied box as nothing', () => {
    expect(
      contactFields({ category: 'Labs', name: 'Quest', phone: '   ', fax: '', notes: null }),
    ).toMatchObject({ phone: null, fax: null, notes: null });
  });
});
