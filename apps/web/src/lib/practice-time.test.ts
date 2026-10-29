import { afterEach, describe, expect, it } from 'vitest';
import { localDateIn, zonedTimeToUtc } from '../../../api/src/common/util/zoned-time.util';
import {
  PRACTICE_ZONE,
  atPracticeTime,
  practiceClockOf,
  practiceDate,
  practiceToday,
} from './practice-time';

// 2026 in New Jersey: the clocks go forward at 2am on Sunday 8 March and back
// at 2am on Sunday 1 November.

describe('practiceClockOf', () => {
  it('reads an instant on the New Jersey clock, summer and winter', () => {
    expect(practiceClockOf('2026-07-01T13:30:00.000Z')).toBe('09:30');
    expect(practiceClockOf('2026-12-01T14:05:00.000Z')).toBe('09:05');
  });

  it('gives midnight as 00, not 24', () => {
    expect(practiceClockOf('2026-07-02T04:00:00.000Z')).toBe('00:00');
  });

  it('follows the clock change', () => {
    // 1:59am EST, then 3:00am EDT a minute later.
    expect(practiceClockOf('2026-03-08T06:59:00.000Z')).toBe('01:59');
    expect(practiceClockOf('2026-03-08T07:00:00.000Z')).toBe('03:00');
    // 1:30am happens twice on 1 November: first EDT, then EST.
    expect(practiceClockOf('2026-11-01T05:30:00.000Z')).toBe('01:30');
    expect(practiceClockOf('2026-11-01T06:30:00.000Z')).toBe('01:30');
  });
});

describe('atPracticeTime', () => {
  it('puts a wall-clock time on the practice day of an instant', () => {
    expect(atPracticeTime('2026-07-01T12:00:00.000Z', '09:00')).toBe('2026-07-01T13:00:00.000Z');
    expect(atPracticeTime('2026-12-01T12:00:00.000Z', '09:00')).toBe('2026-12-01T14:00:00.000Z');
  });

  it("takes New Jersey's day, not UTC's", () => {
    // 10pm on 1 July in New Jersey is already 2 July in UTC.
    expect(atPracticeTime('2026-07-02T02:00:00.000Z', '09:00')).toBe('2026-07-01T13:00:00.000Z');
  });

  it('uses the right offset either side of the spring change', () => {
    expect(atPracticeTime('2026-03-08T12:00:00.000Z', '01:00')).toBe('2026-03-08T06:00:00.000Z');
    expect(atPracticeTime('2026-03-08T12:00:00.000Z', '03:00')).toBe('2026-03-08T07:00:00.000Z');
    expect(atPracticeTime('2026-03-08T12:00:00.000Z', '09:00')).toBe('2026-03-08T13:00:00.000Z');
  });

  it('uses the right offset either side of the autumn change', () => {
    expect(atPracticeTime('2026-11-01T12:00:00.000Z', '00:30')).toBe('2026-11-01T04:30:00.000Z');
    expect(atPracticeTime('2026-11-01T12:00:00.000Z', '09:00')).toBe('2026-11-01T14:00:00.000Z');
  });

  it("agrees with the API's zonedTimeToUtc on every half hour around both changes", () => {
    const days = [
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ];
    for (const day of days) {
      // Noon UTC is the same calendar day in New Jersey.
      const onDayOf = `${day}T16:00:00.000Z`;
      for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
        const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        expect(atPracticeTime(onDayOf, time), `${day} ${time}`).toBe(
          zonedTimeToUtc(day, time, PRACTICE_ZONE).toISOString(),
        );
      }
    }
  });
});

describe('practiceToday', () => {
  it('runs from midnight to the last millisecond before the next midnight', () => {
    expect(practiceToday(new Date('2026-07-01T15:00:00.000Z'))).toEqual({
      start: '2026-07-01T04:00:00.000Z',
      end: '2026-07-02T03:59:59.999Z',
    });
  });

  it('is 23 hours long the day the clocks go forward', () => {
    expect(practiceToday(new Date('2026-03-08T15:00:00.000Z'))).toEqual({
      start: '2026-03-08T05:00:00.000Z',
      end: '2026-03-09T03:59:59.999Z',
    });
  });

  it('is 25 hours long the day the clocks go back', () => {
    expect(practiceToday(new Date('2026-11-01T15:00:00.000Z'))).toEqual({
      start: '2026-11-01T04:00:00.000Z',
      end: '2026-11-02T04:59:59.999Z',
    });
  });

  it('is still yesterday in New Jersey late in the evening, when UTC has moved on', () => {
    expect(practiceToday(new Date('2026-07-02T03:30:00.000Z')).start).toBe(
      '2026-07-01T04:00:00.000Z',
    );
  });
});

describe('practiceDate', () => {
  it("is New Jersey's calendar date", () => {
    expect(practiceDate(new Date('2026-07-02T03:59:00.000Z'))).toBe('2026-07-01');
    expect(practiceDate(new Date('2026-07-02T04:00:00.000Z'))).toBe('2026-07-02');
    expect(practiceDate(new Date('2026-01-01T04:59:00.000Z'))).toBe('2025-12-31');
  });

  it("agrees with the API's localDateIn every three hours of a year", () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z');
    for (let hour = 0; hour < 366 * 24; hour += 3) {
      const instant = new Date(start + hour * 3_600_000);
      expect(practiceDate(instant)).toBe(localDateIn(instant, PRACTICE_ZONE));
    }
  });
});

describe('in a browser set to another time zone', () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  // The point of the file (October 2026): a laptop in UTC moved a shift by
  // the difference on every save. Every answer must be the same wherever the
  // browser is.
  const answers = () => ({
    clock: [
      practiceClockOf('2026-03-08T07:00:00.000Z'),
      practiceClockOf('2026-11-01T06:30:00.000Z'),
    ],
    at: [
      atPracticeTime('2026-07-02T02:00:00.000Z', '09:00'),
      atPracticeTime('2026-03-08T12:00:00.000Z', '03:00'),
      atPracticeTime('2026-11-01T12:00:00.000Z', '00:30'),
    ],
    today: [
      practiceToday(new Date('2026-03-08T15:00:00.000Z')),
      practiceToday(new Date('2026-11-01T15:00:00.000Z')),
      practiceToday(new Date('2026-07-02T03:30:00.000Z')),
    ],
    date: practiceDate(new Date('2026-07-02T03:59:00.000Z')),
  });

  it('gives the same answers in UTC, Tokyo, Los Angeles, Kiribati and Lord Howe', () => {
    const inNewJersey = answers();
    for (const zone of [
      'UTC',
      'Asia/Tokyo',
      'America/Los_Angeles',
      'Pacific/Kiritimati',
      'Australia/Lord_Howe',
    ]) {
      process.env.TZ = zone;
      expect(answers(), zone).toEqual(inNewJersey);
    }
  });

  it('really does switch the zone (or the test above proves nothing)', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-540);
    process.env.TZ = 'America/New_York';
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(300);
  });
});
