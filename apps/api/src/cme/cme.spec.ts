import { CmeStatus } from '@prisma/client';
import {
  askedCents,
  countedCents,
  CmeCounted,
  datesWords,
  money,
  requestProblem,
  yearSummary,
} from './cme';

const costs = { registrationCents: 80000, travelCents: 30000, lodgingCents: 45000, otherCents: 0 };
const request = (overrides: Partial<CmeCounted> = {}): CmeCounted => ({
  ...costs,
  status: CmeStatus.APPROVED,
  startsOn: '2027-03-03',
  approvedCents: null,
  reimbursedCents: null,
  ...overrides,
});

describe('CME requests', () => {
  it('adds up what is asked, and counts only approved ones, at what was paid', () => {
    expect(askedCents(costs)).toBe(155000);
    expect(countedCents(request())).toBe(155000);
    expect(countedCents(request({ approvedCents: 120000 }))).toBe(120000);
    expect(countedCents(request({ approvedCents: 120000, reimbursedCents: 99000 }))).toBe(99000);
    expect(countedCents(request({ status: CmeStatus.PENDING }))).toBe(0);
    expect(countedCents(request({ status: CmeStatus.DECLINED }))).toBe(0);
  });

  it('sums a year against the allowance, with what is still waiting beside it', () => {
    const year = yearSummary(
      [
        request({ approvedCents: 100000 }),
        request({ status: CmeStatus.PENDING }),
        request({ startsOn: '2026-11-01' }),
        request({ status: CmeStatus.WITHDRAWN }),
      ],
      2027,
      150000,
    );
    expect(year).toEqual({
      year: 2027,
      allowanceCents: 150000,
      usedCents: 100000,
      waitingCents: 155000,
      leftCents: 50000,
    });
    expect(yearSummary([request()], 2027, null).leftCents).toBeNull();
    expect(yearSummary([request()], 2027, 100000).leftCents).toBe(-55000);
  });

  it('writes money and dates the way the screens do', () => {
    expect(money(155000)).toBe('$1,550.00');
    expect(money(-500)).toBe('-$5.00');
    expect(datesWords('2027-03-03', '2027-03-03')).toBe('Mar 3, 2027');
    expect(datesWords('2027-03-03', '2027-03-05')).toBe('Mar 3 - 5, 2027');
    expect(datesWords('2027-03-30', '2027-04-02')).toBe('Mar 30 - Apr 2, 2027');
    expect(datesWords('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 - Jan 2, 2027');
  });

  it('says what is wrong with a request', () => {
    const fine = { ...costs, title: 'AAFP FMX', startsOn: '2027-03-03', endsOn: '2027-03-05' };
    const today = '2026-10-21';
    expect(requestProblem(fine, today)).toBeNull();
    expect(requestProblem({ ...fine, title: ' ' }, today)).toBe('Give the activity a name.');
    expect(requestProblem({ ...fine, endsOn: '2027-03-01' }, today)).toBe(
      'The last day is before the first.',
    );
    expect(requestProblem({ ...fine, startsOn: '2025-09-01', endsOn: '2025-09-01' }, today)).toBe(
      'That was more than a year ago.',
    );
    expect(requestProblem({ ...fine, startsOn: '2029-03-03', endsOn: '2029-03-03' }, today)).toBe(
      'Ask about activities up to 2 years ahead.',
    );
    expect(requestProblem({ ...fine, travelCents: -1 }, today)).toBe(
      'Each cost is from $0 to $50,000.',
    );
    expect(requestProblem({ ...fine, credits: 500 }, today)).toBe(
      'Credits are a number from 0 to 200.',
    );
  });
});
