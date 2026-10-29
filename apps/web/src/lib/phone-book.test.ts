import { describe, expect, it } from 'vitest';
import {
  addressLines,
  categoriesOf,
  doctorsOf,
  groupByCategory,
  linkify,
  printedOffices,
  searchContacts,
} from './phone-book';
import type { ReferralContact, ReferralOffice } from './types';

const office = (fields: Partial<ReferralOffice> = {}): ReferralOffice => ({
  id: 'o',
  label: null,
  address: null,
  phone: null,
  fax: null,
  ...fields,
});

const contact = (fields: Partial<ReferralContact> = {}): ReferralContact => ({
  id: fields.name ?? 'c',
  category: 'Cardiology',
  name: 'Somebody',
  practice: null,
  preferred: false,
  email: null,
  website: null,
  notes: null,
  offices: [],
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...fields,
});

describe('addressLines', () => {
  it('puts the town, state and zip on a second line', () => {
    expect(addressLines('123 Main St, Union City, NJ 07087')).toEqual([
      '123 Main St',
      'Union City, NJ 07087',
    ]);
  });

  it('keeps a suite with the street', () => {
    expect(addressLines('7901 Kennedy Blvd, Suite 2, North Bergen, NJ 07047')).toEqual([
      '7901 Kennedy Blvd, Suite 2',
      'North Bergen, NJ 07047',
    ]);
  });

  it('takes a zip+4, or no zip at all', () => {
    expect(addressLines('1 Main St, Teaneck, NJ 07666-1234')).toEqual([
      '1 Main St',
      'Teaneck, NJ 07666-1234',
    ]);
    expect(addressLines('1 Main St, Teaneck, NJ')).toEqual(['1 Main St', 'Teaneck, NJ']);
  });

  it('leaves anything else as one line, trimmed', () => {
    expect(addressLines('  Hackensack, NJ ')).toEqual(['Hackensack, NJ']);
    expect(addressLines('180 N Dean St Englewood NJ 07631')).toEqual([
      '180 N Dean St Englewood NJ 07631',
    ]);
    expect(addressLines('1 Main St, Teaneck, nj 07666')).toEqual(['1 Main St, Teaneck, nj 07666']);
  });
});

describe('doctorsOf', () => {
  it('lists a group written with slashes, one to a line', () => {
    expect(doctorsOf('Dr. Jose Santana / Dr. Umesh Katdare')).toEqual({
      doctors: ['Dr. Jose Santana', 'Dr. Umesh Katdare'],
      note: null,
    });
    expect(
      doctorsOf('Dr. Alexandru F Kimel / Dr. Neil J. Gonter/ Dr. Dewan Fahima').doctors,
    ).toEqual(['Dr. Alexandru F Kimel', 'Dr. Neil J. Gonter', 'Dr. Dewan Fahima']);
  });

  it('lists a group written with commas or only spaces', () => {
    expect(doctorsOf('Dr. Sonal Pathak, Dr. Yazan Vwich').doctors).toEqual([
      'Dr. Sonal Pathak',
      'Dr. Yazan Vwich',
    ]);
    expect(doctorsOf('Dr. Rahul Sood Dr. Sachin K. Shah').doctors).toEqual([
      'Dr. Rahul Sood',
      'Dr. Sachin K. Shah',
    ]);
    expect(doctorsOf('Dr Sushama Mody / Dr Michael Guma').doctors).toEqual([
      'Dr Sushama Mody',
      'Dr Michael Guma',
    ]);
  });

  it("keeps a comma inside one doctor's name", () => {
    expect(doctorsOf('Dr. Steven C Goldstein, Dr. Meron Debesai, MD').doctors).toEqual([
      'Dr. Steven C Goldstein',
      'Dr. Meron Debesai, MD',
    ]);
  });

  it("makes the last doctor's specialty the group's note when nobody else has one", () => {
    expect(doctorsOf('Dr. Angel Mulkay / Dr. Michael Cohen (Interventional Cardiology)')).toEqual({
      doctors: ['Dr. Angel Mulkay', 'Dr. Michael Cohen'],
      note: 'Interventional Cardiology',
    });
  });

  it('leaves each specialty with its doctor when several have one', () => {
    expect(doctorsOf('Dr. Ari Geliebter (Adult) / Dr. Rebecca Geliebter (Pediatric)')).toEqual({
      doctors: ['Dr. Ari Geliebter (Adult)', 'Dr. Rebecca Geliebter (Pediatric)'],
      note: null,
    });
  });

  it('leaves a single name exactly as it is', () => {
    expect(doctorsOf('Hackensack Meridian Health')).toEqual({
      doctors: ['Hackensack Meridian Health'],
      note: null,
    });
    expect(doctorsOf(' Dr. Lone Ranger (Cardiology) ')).toEqual({
      doctors: ['Dr. Lone Ranger (Cardiology)'],
      note: null,
    });
    expect(doctorsOf('Drew Medical Associates').doctors).toEqual(['Drew Medical Associates']);
  });

  // Known bug, found while writing these tests (October 2026) and not fixed
  // here: any slash splits the name, brackets or not, and so does "Dr." after
  // a practice's name. About a dozen of the book's 315 entries show broken on
  // the cards and the printout. `it.fails` passes while the bug is there; once
  // it is fixed, make these plain `it`.
  it.fails('keeps a slash inside brackets in one piece', () => {
    expect(doctorsOf('Dr. Payal Shah (Ob/Gyn)').doctors).toEqual(['Dr. Payal Shah (Ob/Gyn)']);
  });

  it.fails('keeps a single place with a slash in its brackets in one piece', () => {
    expect(doctorsOf('Bergen Imaging Center, P.A. (English/Spanish/Korean)').doctors).toEqual([
      'Bergen Imaging Center, P.A. (English/Spanish/Korean)',
    ]);
  });

  it.fails('keeps "w/" in one piece', () => {
    expect(
      doctorsOf(
        'Tawil Physical Therapy & Sports Performance, PA (Provide transportation w/Town WNY)',
      ).doctors,
    ).toHaveLength(1);
  });

  it.fails('does not split a practice from its one doctor', () => {
    expect(doctorsOf('Grau Orthopedics - Dr. Luis Grau').doctors).toEqual([
      'Grau Orthopedics - Dr. Luis Grau',
    ]);
  });
});

describe('searchContacts', () => {
  const book = [
    contact({
      name: 'Apex Heart',
      category: 'Cardiology',
      preferred: true,
      offices: [
        office({ address: '1 Main St, Union City, NJ 07087', phone: '(201) 854-3100' }),
        office({ label: 'Teaneck', address: '9 Elm St, Teaneck, NJ 07666', fax: '201.555.0199' }),
      ],
    }),
    contact({
      name: 'Dr. Angel Mulkay / Dr. Michael Cohen',
      category: 'Cardiology',
      notes: 'Fax over the last EKG',
    }),
    contact({
      name: 'LabCorp',
      category: 'Labs',
      email: 'Orders@LabCorp.com',
      practice: 'LabCorp NJ',
    }),
  ];
  const search = (
    query: string,
    extra: Partial<{ category: string; preferredOnly: boolean }> = {},
  ) =>
    searchContacts(book, { query, category: '', preferredOnly: false, ...extra }).map(
      (c) => c.name,
    );

  it('finds everything with nothing typed', () => {
    expect(search('')).toHaveLength(3);
    expect(search('   ')).toHaveLength(3);
  });

  it('matches every word, in any field and any order, ignoring case', () => {
    expect(search('cohen')).toEqual(['Dr. Angel Mulkay / Dr. Michael Cohen']);
    expect(search('EKG cardiology')).toEqual(['Dr. Angel Mulkay / Dr. Michael Cohen']);
    expect(search('teaneck heart')).toEqual(['Apex Heart']);
    expect(search('orders@labcorp')).toEqual(['LabCorp']);
    expect(search('labcorp nj')).toEqual(['LabCorp']);
    expect(search('cohen teaneck')).toEqual([]);
  });

  it('looks in every office, not just the first', () => {
    expect(search('elm')).toEqual(['Apex Heart']);
  });

  it('finds a number however it is written', () => {
    expect(search('2018543100')).toEqual(['Apex Heart']);
    expect(search('201-854-3100')).toEqual(['Apex Heart']);
    expect(search('(201) 854')).toEqual(['Apex Heart']);
    expect(search('5550199')).toEqual(['Apex Heart']);
  });

  it('does not match a number by fewer than three digits', () => {
    // "19" is in 201.555.0199 once the dots are taken out, but "1-9" is not
    // written anywhere.
    expect(search('1-9')).toEqual([]);
    expect(search('5-0199')).toEqual(['Apex Heart']);
  });

  it('narrows by heading and by star', () => {
    expect(search('', { category: 'Labs' })).toEqual(['LabCorp']);
    expect(search('', { preferredOnly: true })).toEqual(['Apex Heart']);
    expect(search('cohen', { preferredOnly: true })).toEqual([]);
  });
});

describe('headings', () => {
  const book = [
    contact({ name: 'zeta', category: 'cardiology' }),
    contact({ name: 'Alpha', category: 'Labs' }),
    contact({ name: 'beta', category: 'Labs', preferred: true }),
    contact({ name: 'Gamma', category: 'Labs' }),
    contact({ name: 'Delta', category: 'Allergy' }),
  ];

  it('lists each heading once, A to Z whatever the case', () => {
    expect(categoriesOf(book)).toEqual(['Allergy', 'cardiology', 'Labs']);
  });

  it('groups by heading, starred first and then A to Z', () => {
    expect(
      groupByCategory(book).map((group) => [group.category, group.contacts.map((c) => c.name)]),
    ).toEqual([
      ['Allergy', ['Delta']],
      ['cardiology', ['zeta']],
      ['Labs', ['beta', 'Alpha', 'Gamma']],
    ]);
  });
});

describe('printedOffices', () => {
  it('puts neighbouring addresses with the same numbers on one line', () => {
    const lines = printedOffices([
      office({ address: '1 A St', phone: '201-555-0100', fax: '201-555-0101' }),
      office({ address: '2 B St', phone: '201-555-0100', fax: '201-555-0101' }),
      office({ address: '3 C St', phone: '201-555-0199', fax: '201-555-0101' }),
    ]);
    expect(lines).toEqual([
      { label: null, addresses: ['1 A St', '2 B St'], phone: '201-555-0100', fax: '201-555-0101' },
      { label: null, addresses: ['3 C St'], phone: '201-555-0199', fax: '201-555-0101' },
    ]);
  });

  it('keeps an office with its own name on its own line', () => {
    const lines = printedOffices([
      office({ address: '1 A St', phone: '201-555-0100' }),
      office({ label: 'Teaneck', address: '2 B St', phone: '201-555-0100' }),
      office({ address: '3 C St', phone: '201-555-0100' }),
    ]);
    expect(lines.map((line) => line.addresses)).toEqual([['1 A St'], ['2 B St'], ['3 C St']]);
  });

  it('keeps an office with no address as a line of its own', () => {
    expect(printedOffices([office({ phone: '201-555-0100' })])).toEqual([
      { label: null, addresses: [], phone: '201-555-0100', fax: null },
    ]);
  });
});

describe('linkify', () => {
  it('makes a phone number something to call', () => {
    expect(linkify('Call (201) 854-3100 today')).toEqual([
      { kind: 'text', text: 'Call ' },
      { kind: 'phone', text: '(201) 854-3100', href: 'tel:+12018543100' },
      { kind: 'text', text: ' today' },
    ]);
    expect(linkify('1-800-223-0570')).toEqual([
      { kind: 'phone', text: '1-800-223-0570', href: 'tel:+18002230570' },
    ]);
  });

  it('leaves a fax number as text', () => {
    expect(linkify('Fax: 201-833-7138')).toEqual([{ kind: 'text', text: 'Fax: 201-833-7138' }]);
    expect(linkify('For Lab Results: 201-553-0500 F: 201-553-0501')).toEqual([
      { kind: 'text', text: 'For Lab Results: ' },
      { kind: 'phone', text: '201-553-0500', href: 'tel:+12015530500' },
      { kind: 'text', text: ' F: 201-553-0501' },
    ]);
  });

  it('still dials a number after "fax" when a phone is named in between', () => {
    expect(linkify('Fax or phone 201-833-7138').some((piece) => piece.kind === 'phone')).toBe(true);
  });

  it('makes an email address something to write to', () => {
    expect(linkify('Email admin@medlifediagnostic.com.')).toEqual([
      { kind: 'text', text: 'Email ' },
      {
        kind: 'email',
        text: 'admin@medlifediagnostic.com',
        href: 'mailto:admin@medlifediagnostic.com',
      },
      { kind: 'text', text: '.' },
    ]);
  });

  it('makes a link something to open, leaving a full stop after it as text', () => {
    expect(linkify('See www.example.com.')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'web', text: 'www.example.com', href: 'https://www.example.com' },
      { kind: 'text', text: '.' },
    ]);
    expect(linkify('https://labs.example.org/orders')).toEqual([
      {
        kind: 'web',
        text: 'https://labs.example.org/orders',
        href: 'https://labs.example.org/orders',
      },
    ]);
  });

  it('gives back plain text untouched', () => {
    expect(linkify('No numbers here')).toEqual([{ kind: 'text', text: 'No numbers here' }]);
    expect(linkify('')).toEqual([]);
  });
});
