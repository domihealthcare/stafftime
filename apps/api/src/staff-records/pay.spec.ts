import { PayRaiseStatus, PayRateUnit } from '@prisma/client';
import {
  decisionProblem,
  isOpen,
  MAX_RAISE_MESSAGE_LENGTH,
  meetingTitle,
  payrollNoticeWords,
  raiseNoticeWords,
  statusWithMeeting,
  statusWithoutMeeting,
  tellProblem,
  upcomingOf,
  visibleToPerson,
} from './pay';
import type { EmploymentChangeView } from './staff-records.service';

function change(effectiveOn: string, payRate: number | null): EmploymentChangeView {
  return {
    id: effectiveOn,
    effectiveOn,
    kind: 'PAY_CHANGE',
    position: null,
    payRate,
    payUnit: payRate === null ? null : PayRateUnit.HOURLY,
    note: null,
    recordedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('raise rules', () => {
  it('knows which raises are still open', () => {
    expect(isOpen(PayRaiseStatus.REQUESTED)).toBe(true);
    expect(isOpen(PayRaiseStatus.OFFERED)).toBe(true);
    expect(isOpen(PayRaiseStatus.APPROVED)).toBe(false);
    expect(isOpen(PayRaiseStatus.WITHDRAWN)).toBe(false);
  });

  it('needs the pay to offer, and the pay and a day to approve', () => {
    const open = PayRaiseStatus.MEETING_SET;
    expect(decisionProblem(open, { outcome: 'DECLINED' })).toBeNull();
    expect(decisionProblem(open, { outcome: 'OFFERED' })).toMatch(/offered/);
    expect(
      decisionProblem(open, { outcome: 'OFFERED', newRate: 20, newUnit: PayRateUnit.HOURLY }),
    ).toBeNull();
    expect(
      decisionProblem(open, { outcome: 'APPROVED', newRate: 20, newUnit: PayRateUnit.HOURLY }),
    ).toMatch(/day/);
    expect(
      decisionProblem(open, {
        outcome: 'APPROVED',
        newRate: 20,
        newUnit: PayRateUnit.HOURLY,
        effectiveOn: '2026-11-01',
      }),
    ).toBeNull();
    expect(decisionProblem(open, { outcome: 'APPROVED', newRate: 20 })).toMatch(/per hour/);
    expect(decisionProblem(PayRaiseStatus.APPROVED, { outcome: 'DECLINED' })).toMatch(/settled/);
  });

  it('keeps an offer offered when a meeting is set or taken off', () => {
    expect(statusWithMeeting(PayRaiseStatus.REQUESTED)).toBe(PayRaiseStatus.MEETING_SET);
    expect(statusWithMeeting(PayRaiseStatus.OFFERED)).toBe(PayRaiseStatus.OFFERED);
    expect(statusWithoutMeeting(PayRaiseStatus.MEETING_SET)).toBe(PayRaiseStatus.REQUESTED);
    expect(statusWithoutMeeting(PayRaiseStatus.OFFERED)).toBe(PayRaiseStatus.OFFERED);
  });

  it('finds the next pay change still to come', () => {
    const changes = [change('2026-12-01', 22), change('2026-11-01', 21), change('2026-01-01', 20)];
    expect(upcomingOf(changes, '2026-10-23')).toEqual({
      rate: 21,
      unit: PayRateUnit.HOURLY,
      effectiveOn: '2026-11-01',
      position: null,
    });
    expect(upcomingOf(changes, '2026-12-01')).toBeNull();
    expect(upcomingOf([change('2026-11-01', null)], '2026-10-23')).toBeNull();
  });

  it('says nothing about pay in the meeting title', () => {
    expect(meetingTitle('Frankie', 'Morgan')).toBe('Check-in: Frankie and Morgan');
    expect(meetingTitle('Frankie', 'Frankie')).toBe('Check-in: Frankie');
  });
});

describe('telling somebody about their raise', () => {
  const approved = {
    status: PayRaiseStatus.APPROVED,
    toldAt: null,
    payChangeKept: true,
    message: null,
  };

  it('tells only an approved raise, once, with its pay change still there', () => {
    expect(tellProblem(approved)).toBeNull();
    expect(tellProblem({ ...approved, status: PayRaiseStatus.OFFERED })).toMatch(/approved/);
    expect(tellProblem({ ...approved, toldAt: new Date() })).toMatch(/already/);
    expect(tellProblem({ ...approved, payChangeKept: false })).toMatch(/taken out/);
    expect(tellProblem({ ...approved, message: 'x'.repeat(MAX_RAISE_MESSAGE_LENGTH + 1) })).toMatch(
      /at most/,
    );
  });

  it('never puts the amount on the bell or in the email', () => {
    const words = raiseNoticeWords({ effectiveOn: '2026-12-01', newPosition: null }, '2026-11-23');
    expect(words.title).toBe('Good news about your pay');
    expect(words.body).toBe(
      'Your pay changes from Tuesday, Dec 1. See it under Your pay in Domi Staff; your PIN is asked first.',
    );
    expect(words.link).toBe('/your-pay');
    expect(JSON.stringify(words)).not.toMatch(/\$|\d+\.\d\d/);
  });

  it('says when a new title comes with it, and when the day has passed', () => {
    expect(
      raiseNoticeWords({ effectiveOn: '2026-12-01', newPosition: 'Lead MA' }, '2026-11-23').body,
    ).toMatch(/^Your pay and position change from Tuesday, Dec 1\./);
    expect(
      raiseNoticeWords({ effectiveOn: '2026-11-15', newPosition: null }, '2026-11-23').body,
    ).toMatch(/^Your pay changed on Sunday, Nov 15\./);
  });

  it('asks payroll to update ADP with the name and day, never the amount', () => {
    const words = payrollNoticeWords(
      { firstName: 'Selena', lastName: 'V', preferredName: null },
      'abc',
      { effectiveOn: '2026-12-01' },
      '2026-11-23',
    );
    expect(words.title).toBe('Update ADP: a raise for Selena V');
    expect(words.body).toMatch(/^Their new pay starts Tuesday, Dec 1\./);
    expect(words.link).toBe('/pay?person=abc');
  });

  it('keeps a raise they have not been told about off their own pay', () => {
    const changes = [change('2026-11-01', 20), change('2026-10-01', 18)];
    expect(visibleToPerson(changes, new Set(['2026-11-01']))).toEqual([changes[1]]);
    expect(visibleToPerson(changes, new Set())).toEqual(changes);
  });
});
