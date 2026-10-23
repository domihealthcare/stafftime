import { contactFields, officeRows } from './phone-book.service';

describe('contactFields', () => {
  it('keeps what was typed, trimmed', () => {
    expect(
      contactFields({
        category: ' Labs ',
        name: ' Quest Diagnostic Lab ',
        practice: ' Quest Diagnostics ',
        preferred: true,
        email: ' x@example.com ',
        notes: ' Specimen pick-up 1-800-223-0570 ',
      }),
    ).toEqual({
      category: 'Labs',
      name: 'Quest Diagnostic Lab',
      practice: 'Quest Diagnostics',
      preferred: true,
      email: 'x@example.com',
      website: null,
      notes: 'Specimen pick-up 1-800-223-0570',
    });
  });

  it('is not starred unless it says so, and keeps an emptied box as nothing', () => {
    expect(
      contactFields({ category: 'Labs', name: 'Quest', email: '   ', website: '', notes: null }),
    ).toMatchObject({ preferred: false, practice: null, email: null, website: null, notes: null });
  });
});

describe('officeRows', () => {
  it('keeps each office in the order written, numbered', () => {
    expect(
      officeRows([
        { label: ' Hoboken ', address: '59 Newark St', phone: '551-350-6910, 201-555-0100' },
        { address: '3196 Kennedy Blvd', phone: '551-350-6910', fax: ' 201-253-0454 ' },
      ]),
    ).toEqual([
      {
        label: 'Hoboken',
        address: '59 Newark St',
        phone: '551-350-6910, 201-555-0100',
        fax: null,
        sortOrder: 0,
      },
      {
        label: null,
        address: '3196 Kennedy Blvd',
        phone: '551-350-6910',
        fax: '201-253-0454',
        sortOrder: 1,
      },
    ]);
  });

  it('drops a blank row and allows none at all', () => {
    expect(officeRows([{ label: ' ', phone: '' }, { phone: '201-555-0100' }])).toHaveLength(1);
    expect(officeRows(undefined)).toEqual([]);
  });
});
