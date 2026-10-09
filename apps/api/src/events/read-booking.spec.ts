import { matchBooking, RawBooking } from './read-booking';

const offices = [
  { id: 'nb', name: 'North Bergen' },
  { id: 'wny', name: 'West New York' },
];
const reps = [
  { id: 'rep-sarah', name: 'Sarah Lopez', company: 'Pfizer' },
  { id: 'rep-mike-a', name: 'Mike Chen', company: 'AstraZeneca' },
  { id: 'rep-mike-b', name: 'Mike Chen', company: 'Novo Nordisk' },
];

function raw(over: Partial<RawBooking> = {}): RawBooking {
  return {
    kind: 'REP_LUNCH',
    title: '',
    date: '2026-10-20',
    endDate: '',
    startTime: '12:30',
    endTime: '13:30',
    allDay: false,
    office: 'West New York',
    repName: 'Sarah Lopez',
    repCompany: 'Pfizer',
    medication: 'Eliquis',
    place: '',
    description: '',
    ...over,
  };
}

describe('matchBooking', () => {
  it('finds the office and the rep on the list', () => {
    expect(matchBooking(raw(), offices, reps)).toMatchObject({
      kind: 'REP_LUNCH',
      date: '2026-10-20',
      startTime: '12:30',
      endTime: '13:30',
      allDay: false,
      locationId: 'wny',
      repId: 'rep-sarah',
      newRep: null,
    });
  });

  it('knows the offices by their short names', () => {
    expect(matchBooking(raw({ office: 'NB' }), offices, reps).locationId).toBe('nb');
    expect(matchBooking(raw({ office: 'wny' }), offices, reps).locationId).toBe('wny');
    expect(matchBooking(raw({ office: '' }), offices, reps).locationId).toBeNull();
  });

  it('matches a first name alone, and settles two of a name by the company', () => {
    expect(matchBooking(raw({ repName: 'sarah' }), offices, reps).repId).toBe('rep-sarah');
    expect(
      matchBooking(raw({ repName: 'Mike Chen', repCompany: 'Novo' }), offices, reps).repId,
    ).toBe('rep-mike-b');
    // Two of them and nothing to tell them apart: the manager picks.
    const unsure = matchBooking(raw({ repName: 'Mike Chen', repCompany: '' }), offices, reps);
    expect(unsure.repId).toBeNull();
    expect(unsure.newRep).toBeNull();
  });

  it('names a rep who is not on the list, to be added', () => {
    expect(
      matchBooking(
        raw({ repName: 'Dana Ruiz', repCompany: 'Lilly', medication: 'Mounjaro' }),
        offices,
        reps,
      ),
    ).toMatchObject({
      repId: null,
      newRep: { name: 'Dana Ruiz', company: 'Lilly', medication: 'Mounjaro' },
    });
  });

  it('drops dates and times that are not in the form’s shapes, and an end before the start', () => {
    const read = matchBooking(
      raw({ date: 'next Tuesday', startTime: '12.30pm', endTime: '25:00', endDate: '2026-10-01' }),
      offices,
      reps,
    );
    expect(read).toMatchObject({ date: null, startTime: null, endTime: null, endDate: null });
  });

  it('makes a holiday all day, and anything with a time not', () => {
    expect(
      matchBooking(raw({ kind: 'HOLIDAY', startTime: '', allDay: false }), offices, reps).allDay,
    ).toBe(true);
    expect(
      matchBooking(raw({ kind: 'CLOSURE', startTime: '13:00', allDay: true }), offices, reps)
        .allDay,
    ).toBe(false);
  });

  it('treats an unknown kind as an event, and looks for no rep outside a rep lunch', () => {
    const read = matchBooking(raw({ kind: 'PARTY' as never }), offices, reps);
    expect(read.kind).toBe('EVENT');
    expect(read.repId).toBeNull();
    expect(read.newRep).toBeNull();
  });
});
