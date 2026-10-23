import { PayRaiseStatus, PayRateUnit } from '@prisma/client';
import {
  decisionProblem,
  isOpen,
  meetingTitle,
  statusWithMeeting,
  statusWithoutMeeting,
  upcomingOf,
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
