import { describePayrollDue, dueNow, PayrollDue, workingDaysBefore } from './payroll-due';

// Periods run Sunday to Saturday-week from 18 October 2026: Oct 18 – Oct 31,
// paid Friday Nov 6.
const ANCHOR = '2026-10-18';

describe('workingDaysBefore', () => {
  it('counts back Monday to Friday only', () => {
    expect(workingDaysBefore('2026-10-31', 2)).toBe('2026-10-29'); // Sat → Thu
    expect(workingDaysBefore('2026-10-30', 2)).toBe('2026-10-28'); // Fri → Wed
    expect(workingDaysBefore('2026-10-26', 2)).toBe('2026-10-22'); // Mon → Thu before
  });
});

describe('dueNow', () => {
  it('opens two working days before the end and closes the day before pay day', () => {
    expect(dueNow('2026-10-28', ANCHOR)).toBeNull();
    expect(dueNow('2026-10-29', ANCHOR)).toEqual({
      period: { from: '2026-10-18', to: '2026-10-31' },
      payDay: '2026-11-06',
    });
    // After the period ends — the new one has begun, but this one is due.
    expect(dueNow('2026-11-03', ANCHOR)?.period.from).toBe('2026-10-18');
    expect(dueNow('2026-11-05', ANCHOR)?.payDay).toBe('2026-11-06');
    expect(dueNow('2026-11-06', ANCHOR)).toBeNull();
  });

  it('says nothing until a pay period is set', () => {
    expect(dueNow('2026-10-30', null)).toBeNull();
  });
});

describe('describePayrollDue', () => {
  const due: PayrollDue = {
    period: { from: '2026-10-18', to: '2026-10-31' },
    payDay: '2026-11-06',
    notApproved: 14,
    people: 6,
    toCorrect: 2,
    stillIn: 1,
  };

  it('says when, then what is left', () => {
    expect(describePayrollDue(due, '2026-10-29')).toEqual([
      'Pay period Sun, Oct 18 – Sat, Oct 31 ends Sat, Oct 31, paid Fri, Nov 6',
      '14 entries not approved yet, for 6 people',
      '2 clock-outs made at midnight to correct — they cannot be approved until then',
      '1 punch still open from an earlier day — nobody clocked out',
    ]);
    expect(describePayrollDue(due, '2026-10-31')[0]).toContain('ends today');
    expect(describePayrollDue(due, '2026-11-02')[0]).toContain('ended Sat, Oct 31');
  });

  it('is silent when everything is approved', () => {
    expect(
      describePayrollDue(
        { ...due, notApproved: 0, people: 0, toCorrect: 0, stillIn: 0 },
        '2026-10-30',
      ),
    ).toEqual([]);
  });
});
