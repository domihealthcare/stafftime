import { RequirementKind } from '@prisma/client';
import { askedWording, MAX_WEEKS, nudgeDue, nudgeWording, reminderDays } from './nudges';

describe('when somebody is reminded about required reading', () => {
  const set = { createdOn: '2026-10-01', dueOn: '2026-10-20' };

  it('says nothing before the first reminder day', () => {
    expect(nudgeDue({ ...set, lastOn: null, today: '2026-10-17' })).toBeNull();
  });

  it('reminds two days before it is due, once', () => {
    expect(nudgeDue({ ...set, lastOn: null, today: '2026-10-18' })).toBe('DUE_SOON');
    expect(nudgeDue({ ...set, lastOn: '2026-10-18', today: '2026-10-19' })).toBeNull();
  });

  it('reminds the day after it passes, then weekly', () => {
    expect(nudgeDue({ ...set, lastOn: '2026-10-18', today: '2026-10-21' })).toBe('OVERDUE');
    expect(nudgeDue({ ...set, lastOn: '2026-10-21', today: '2026-10-27' })).toBeNull();
    expect(nudgeDue({ ...set, lastOn: '2026-10-21', today: '2026-10-28' })).toBe('OVERDUE');
  });

  it('sends one message for missed days, not one each', () => {
    // Away from the 15th to the 30th: only the latest day counts.
    expect(nudgeDue({ ...set, lastOn: null, today: '2026-10-30' })).toBe('OVERDUE');
    expect(nudgeDue({ ...set, lastOn: '2026-10-30', today: '2026-11-03' })).toBeNull();
  });

  it('skips "due soon" when it was set less than two days before', () => {
    const late = { createdOn: '2026-10-19', dueOn: '2026-10-20' };
    expect(nudgeDue({ ...late, lastOn: null, today: '2026-10-19' })).toBeNull();
    expect(nudgeDue({ ...late, lastOn: null, today: '2026-10-21' })).toBe('OVERDUE');
  });

  it('without a due date, reminds weekly from the day it was set', () => {
    const open = { createdOn: '2026-10-01', dueOn: null };
    expect(nudgeDue({ ...open, lastOn: null, today: '2026-10-07' })).toBeNull();
    expect(nudgeDue({ ...open, lastOn: null, today: '2026-10-08' })).toBe('WAITING');
    expect(nudgeDue({ ...open, lastOn: '2026-10-08', today: '2026-10-14' })).toBeNull();
    expect(nudgeDue({ ...open, lastOn: '2026-10-08', today: '2026-10-15' })).toBe('WAITING');
  });

  it(`stops after ${MAX_WEEKS} weeks of reminders`, () => {
    const open = { createdOn: '2026-01-01', dueOn: null };
    const days = reminderDays(open.createdOn, null);
    const last = days[days.length - 1].on;
    expect(nudgeDue({ ...open, lastOn: last, today: '2026-12-31' })).toBeNull();
  });

  it('does not remind on the day it was set', () => {
    expect(
      nudgeDue({ createdOn: '2026-10-18', dueOn: '2026-10-20', lastOn: null, today: '2026-10-18' }),
    ).toBeNull();
  });
});

describe('the words', () => {
  it('asks to read and confirm, with the date', () => {
    const words = askedWording({
      kind: RequirementKind.READ,
      title: 'Fire safety plan',
      dueOn: '2026-10-20',
    });
    expect(words.title).toBe('Please read and confirm: “Fire safety plan”');
    expect(words.body).toContain('By Tue, Oct 20.');
    expect(words.body).toContain('I’ve read it');
  });

  it('puts several into one message, soonest first', () => {
    const words = nudgeWording([
      { kind: RequirementKind.TASK, title: 'B', dueOn: null, stage: 'WAITING' },
      { kind: RequirementKind.READ, title: 'A', dueOn: '2026-10-20', stage: 'OVERDUE' },
    ]);
    expect(words.title).toBe('2 things are waiting for you');
    expect(words.body.indexOf('“A”')).toBeLessThan(words.body.indexOf('“B”'));
    expect(words.body).toContain('was due Tue, Oct 20');
  });
});
