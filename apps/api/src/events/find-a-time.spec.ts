import { UnavailabilityKind } from '@prisma/client';
import { PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { findTimes, judgeSlot, Slot, slotsToSearch, standingAt, TimePerson } from './find-a-time';

/// Tuesday 20 October 2026 (New Jersey is on EDT, UTC−4).
const TUESDAY = '2026-10-20';
const EARLY = new Date('2026-10-19T12:00:00.000Z');
const at = (date: string, time: string) => new Date(`${date}T${time}:00-04:00`);

function person(over: Partial<TimePerson> = {}): TimePerson {
  return { id: 'p', name: 'Kayla D', shifts: [], timeOff: [], meetings: [], rules: [], ...over };
}

function slot(date: string, start: string, end: string): Slot {
  return { startsAt: at(date, start), endsAt: at(date, end), date, startTime: start, endTime: end };
}

describe('slotsToSearch', () => {
  it('offers every half hour from 7am, ending by 7pm, on each day', () => {
    const slots = slotsToSearch(TUESDAY, 2, 60, EARLY, PRACTICE_ZONE);
    // 7:00 … 6:00 PM is 23 starts a day.
    expect(slots).toHaveLength(46);
    expect(slots[0]).toMatchObject({ date: TUESDAY, startTime: '07:00', endTime: '08:00' });
    expect(slots[0].startsAt).toEqual(new Date('2026-10-20T11:00:00.000Z'));
    expect(slots[22]).toMatchObject({ startTime: '18:00', endTime: '19:00' });
    expect(slots[23].date).toBe('2026-10-21');
  });

  it('never offers a time already gone', () => {
    const slots = slotsToSearch(TUESDAY, 1, 30, at(TUESDAY, '15:10'), PRACTICE_ZONE);
    expect(slots[0].startTime).toBe('15:30');
  });

  it('keeps New Jersey’s times across the clocks changing', () => {
    // Clocks go back on Sunday 1 November 2026.
    const slots = slotsToSearch('2026-11-02', 1, 60, EARLY, PRACTICE_ZONE);
    expect(slots[0].startsAt).toEqual(new Date('2026-11-02T12:00:00.000Z'));
    expect(slots[0].startTime).toBe('07:00');
  });
});

describe('standingAt', () => {
  const noon = slot(TUESDAY, '12:00', '13:00');

  it('is at work when a shift covers all of it', () => {
    const kayla = person({
      shifts: [{ startsAt: at(TUESDAY, '09:00'), endsAt: at(TUESDAY, '17:00') }],
    });
    expect(standingAt(kayla, noon)).toEqual({ standing: 'work' });
  });

  it('is free, not at work, with nothing on', () => {
    expect(standingAt(person(), noon)).toEqual({ standing: 'free' });
  });

  it('is worth a check when the shift covers only part of it', () => {
    const kayla = person({
      shifts: [{ startsAt: at(TUESDAY, '07:00'), endsAt: at(TUESDAY, '12:30') }],
    });
    expect(standingAt(kayla, noon)).toEqual({
      standing: 'check',
      why: 'On the rota for only part of it',
    });
  });

  it('is busy on a day off, and in another meeting', () => {
    expect(
      standingAt(
        person({
          timeOff: [{ startDate: TUESDAY, endDate: '2026-10-21', approved: true, halfDay: false }],
        }),
        noon,
      ),
    ).toEqual({ standing: 'busy', why: 'Off that day' });
    expect(
      standingAt(
        person({
          meetings: [
            {
              startsAt: at(TUESDAY, '12:30'),
              endsAt: at(TUESDAY, '13:30'),
              title: 'Provider meeting',
            },
          ],
        }),
        noon,
      ),
    ).toEqual({ standing: 'busy', why: 'In “Provider meeting”' });
  });

  it('is worth a check on a half day or a day asked for', () => {
    const half = { startDate: TUESDAY, endDate: TUESDAY, approved: true, halfDay: true };
    const asked = { startDate: TUESDAY, endDate: TUESDAY, approved: false, halfDay: false };
    expect(standingAt(person({ timeOff: [half] }), noon).why).toBe('Half day off');
    expect(standingAt(person({ timeOff: [asked] }), noon).why).toBe('Asked for that day off');
  });

  it('is worth a check when they said they can’t, off the rota', () => {
    const kayla = person({
      rules: [
        {
          kind: UnavailabilityKind.WEEKLY,
          weekday: 2,
          date: null,
          startTime: '11:00',
          endTime: '14:00',
          effectiveFrom: '2026-01-01',
          effectiveUntil: null,
        },
      ],
    });
    expect(standingAt(kayla, noon)).toEqual({
      standing: 'check',
      why: 'Not available Tuesdays, 11:00 AM–2:00 PM',
    });
  });

  it('a meeting next to the slot is not in its way', () => {
    const kayla = person({
      meetings: [{ startsAt: at(TUESDAY, '13:00'), endsAt: at(TUESDAY, '14:00'), title: 'Huddle' }],
    });
    expect(standingAt(kayla, noon)).toEqual({ standing: 'free' });
  });
});

describe('judgeSlot', () => {
  it('counts who is at work and names everybody else', () => {
    const working = { startsAt: at(TUESDAY, '08:00'), endsAt: at(TUESDAY, '16:00') };
    const result = judgeSlot(slot(TUESDAY, '12:00', '13:00'), [
      person({ name: 'Kayla D', shifts: [working] }),
      person({ name: 'Max R' }),
      person({
        name: 'Frankie T',
        timeOff: [{ startDate: TUESDAY, endDate: TUESDAY, approved: true, halfDay: false }],
      }),
    ]);
    expect(result).toMatchObject({
      total: 3,
      atWork: 1,
      notOnRota: ['Max R'],
      check: [],
      busy: [{ name: 'Frankie T', why: 'Off that day' }],
    });
  });
});

describe('findTimes', () => {
  // Kayla works Tuesday and Wednesday 9–5; Max only Wednesday, and is off Tuesday.
  const kayla = person({
    id: 'k',
    name: 'Kayla D',
    shifts: [
      { startsAt: at(TUESDAY, '09:00'), endsAt: at(TUESDAY, '17:00') },
      { startsAt: at('2026-10-21', '09:00'), endsAt: at('2026-10-21', '17:00') },
    ],
  });
  const max = person({
    id: 'm',
    name: 'Max R',
    shifts: [{ startsAt: at('2026-10-21', '09:00'), endsAt: at('2026-10-21', '17:00') }],
    timeOff: [{ startDate: TUESDAY, endDate: TUESDAY, approved: true, halfDay: false }],
  });

  it('puts the times everybody is at work first', () => {
    const slots = slotsToSearch(TUESDAY, 2, 60, EARLY, PRACTICE_ZONE);
    const found = findTimes(slots, [kayla, max], PRACTICE_ZONE);
    expect(found[0]).toMatchObject({
      startsAt: at('2026-10-21', '09:00'),
      atWork: 2,
      busy: [],
      notOnRota: [],
    });
    // Tuesday, with Max off, comes after every Wednesday time.
    expect(found.findIndex((s) => s.busy.length > 0)).toBeGreaterThan(0);
    expect(found.slice(0, 2).every((s) => s.busy.length === 0)).toBe(true);
  });

  it('offers at most two a day, never overlapping, and six in all', () => {
    const slots = slotsToSearch(TUESDAY, 7, 60, EARLY, PRACTICE_ZONE);
    const found = findTimes(slots, [person()], PRACTICE_ZONE);
    expect(found).toHaveLength(6);
    const byDay = new Map<string, typeof found>();
    for (const one of found) {
      const day = one.startsAt.toISOString().slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), one]);
    }
    for (const same of byDay.values()) {
      expect(same.length).toBeLessThanOrEqual(2);
      if (same.length === 2)
        expect(same[0].endsAt <= same[1].startsAt || same[1].endsAt <= same[0].startsAt).toBe(true);
    }
  });

  it('prefers a weekday to a weekend when nothing else tells them apart', () => {
    // Saturday 24 October first, then Monday 26.
    const slots = slotsToSearch('2026-10-24', 3, 60, EARLY, PRACTICE_ZONE);
    const found = findTimes(slots, [person()], PRACTICE_ZONE);
    expect(found[0].startsAt).toEqual(at('2026-10-26', '07:00'));
  });
});
