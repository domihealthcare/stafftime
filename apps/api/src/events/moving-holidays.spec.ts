import { easter, movedFirstDay, nthWeekday, weekendDay } from './moving-holidays';

describe('moving holidays', () => {
  it('finds the nth and the last weekday of a month', () => {
    expect(nthWeekday(2026, 11, 4, 4)).toBe('2026-11-26'); // Thanksgiving 2026
    expect(nthWeekday(2027, 11, 4, 4)).toBe('2027-11-25');
    expect(nthWeekday(2027, 5, 1, -1)).toBe('2027-05-31'); // Memorial Day
    expect(nthWeekday(2027, 9, 1, 1)).toBe('2027-09-06'); // Labor Day
  });

  it('works out Easter', () => {
    expect(easter(2026)).toBe('2026-04-05');
    expect(easter(2027)).toBe('2027-03-28');
    expect(easter(2028)).toBe('2028-04-16');
  });

  it('moves a holiday that was on its day, by its name', () => {
    expect(movedFirstDay('Thanksgiving', '2026-11-26', 2027)).toBe('2027-11-25');
    expect(movedFirstDay('Day after Thanksgiving', '2026-11-27', 2027)).toBe('2027-11-26');
    expect(movedFirstDay('Office closed — Memorial Day', '2026-05-25', 2027)).toBe('2027-05-31');
    expect(movedFirstDay('Labor Day', '2026-09-07', 2027)).toBe('2027-09-06');
    expect(movedFirstDay('MLK Day', '2026-01-19', 2027)).toBe('2027-01-18');
    expect(movedFirstDay("Presidents' Day", '2026-02-16', 2027)).toBe('2027-02-15');
    expect(movedFirstDay('Columbus Day', '2026-10-12', 2027)).toBe('2027-10-11');
    expect(movedFirstDay('Election Day', '2026-11-03', 2027)).toBe('2027-11-02');
    expect(movedFirstDay('Good Friday', '2026-04-03', 2027)).toBe('2027-03-26');
  });

  it('leaves alone what is not on the holiday’s day, or not a moving one', () => {
    expect(movedFirstDay('Thanksgiving lunch', '2026-11-20', 2027)).toBeNull();
    expect(movedFirstDay('Christmas Day', '2026-12-25', 2027)).toBeNull();
  });

  it('says when a day is on the weekend', () => {
    expect(weekendDay('2027-12-25')).toBe('Saturday');
    expect(weekendDay('2027-07-04')).toBe('Sunday');
    expect(weekendDay('2027-11-25')).toBeNull();
  });
});
