import { expiryFromInterval, standingFor } from './standing';

const today = new Date('2026-09-29T00:00:00Z');
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const type = (id: string, name: string, sortOrder: number) => ({
  id,
  name,
  kind: 'OTHER',
  renewalMonths: null,
  sortOrder,
});

describe('where somebody stands against the licenses their job roles ask for', () => {
  const dea = type('dea', 'DEA registration', 3);
  const bls = type('bls', 'BLS', 6);
  const flu = type('flu', 'Flu vaccine', 8);

  it('says what is missing, lapsed, due soon or current — required first', () => {
    const lines = standingFor(
      [
        { credentialTypeId: 'bls', required: false, jobRoleName: 'Provider', type: bls },
        { credentialTypeId: 'dea', required: true, jobRoleName: 'Provider', type: dea },
        { credentialTypeId: 'flu', required: false, jobRoleName: 'Provider', type: flu },
      ],
      [
        { id: 'c1', name: 'BLS', credentialTypeId: 'bls', expiresOn: date('2026-10-20') },
        { id: 'c2', name: 'Flu shot', credentialTypeId: 'flu', expiresOn: date('2026-09-01') },
      ],
      today,
    );
    expect(lines.map((line) => [line.type.name, line.required, line.state])).toEqual([
      ['DEA registration', true, 'MISSING'],
      ['BLS', false, 'DUE_SOON'],
      ['Flu vaccine', false, 'EXPIRED'],
    ]);
    expect(lines[1].credential?.daysUntilExpiry).toBe(21);
  });

  it('counts the renewal that runs longest, not the old card beside it', () => {
    const [line] = standingFor(
      [{ credentialTypeId: 'bls', required: true, jobRoleName: 'MA', type: bls }],
      [
        { id: 'old', name: 'BLS', credentialTypeId: 'bls', expiresOn: date('2026-01-01') },
        { id: 'new', name: 'BLS', credentialTypeId: 'bls', expiresOn: date('2028-01-01') },
      ],
      today,
    );
    expect(line).toMatchObject({ state: 'CURRENT', credential: { id: 'new' } });
  });

  it('matches one recorded free-hand under exactly the same name', () => {
    const [line] = standingFor(
      [{ credentialTypeId: 'dea', required: true, jobRoleName: 'Provider', type: dea }],
      [
        {
          id: 'c1',
          name: ' dea Registration ',
          credentialTypeId: null,
          expiresOn: date('2028-01-01'),
        },
      ],
      today,
    );
    expect(line.state).toBe('CURRENT');
  });

  it('is required when any of their job roles requires it, and says which', () => {
    const [line] = standingFor(
      [
        { credentialTypeId: 'bls', required: false, jobRoleName: 'Front Desk', type: bls },
        { credentialTypeId: 'bls', required: true, jobRoleName: 'Medical Assistant', type: bls },
      ],
      [],
      today,
    );
    expect(line).toMatchObject({ required: true, forRoles: ['Front Desk', 'Medical Assistant'] });
  });
});

describe('an expiry from a renewal interval', () => {
  it('adds the months to the day it was done', () => {
    expect(expiryFromInterval(date('2026-09-03'), 12)).toEqual(date('2027-09-03'));
    expect(expiryFromInterval(date('2026-09-03'), 36)).toEqual(date('2029-09-03'));
  });

  it('lands on the last day of a shorter month', () => {
    expect(expiryFromInterval(date('2026-01-31'), 1)).toEqual(date('2026-02-28'));
  });
});
