import { expenseProblem, nextPayrollFrom } from './expenses';

const ok = {
  description: 'Printer ink for the front desk',
  spentOn: '2026-10-30',
  amountCents: 4210,
  receiptEmailed: true,
};
const today = '2026-11-01';

describe('expenseProblem', () => {
  it('takes a whole request', () => {
    expect(expenseProblem(ok, today)).toBeNull();
  });

  it('needs the receipt emailed first', () => {
    expect(expenseProblem({ ...ok, receiptEmailed: false }, today)).toMatch(/receipt/);
  });

  it('needs what it was for, an amount and a day already past', () => {
    expect(expenseProblem({ ...ok, description: ' a ' }, today)).toMatch(/what it was for/);
    expect(expenseProblem({ ...ok, amountCents: 0 }, today)).toMatch(/amount/);
    expect(expenseProblem({ ...ok, amountCents: 1_000_001 }, today)).toMatch(/amount/);
    expect(expenseProblem({ ...ok, spentOn: '2026-11-02' }, today)).toMatch(/once you have paid/);
    expect(expenseProblem({ ...ok, spentOn: '2025-10-01' }, today)).toMatch(/more than a year/);
  });
});

describe('nextPayrollFrom', () => {
  // Pay periods of two weeks from Monday 19 October 2026: one ends Sunday 1
  // November, the next Sunday 15 November.
  const anchor = '2026-10-19';

  it('is two weeks on with no pay period set', () => {
    expect(nextPayrollFrom('2026-11-01', null)).toBe('2026-11-15');
  });

  it("puts one off to the next payroll's window, two working days before it ends", () => {
    // The window for the period ending Sun 1 Nov opened Thu 29 Oct: today it
    // is the payroll being done, so the next is the period ending Sun 15 Nov,
    // whose window opens Thu 12 Nov.
    expect(nextPayrollFrom('2026-11-01', anchor)).toBe('2026-11-12');
    // Before a window opens, that window.
    expect(nextPayrollFrom('2026-10-27', anchor)).toBe('2026-10-29');
  });
});
