import { ShiftStatus } from '@prisma/client';
import { NoticeShift, shiftNotices } from './shift-notices';

const northBergen = { name: 'North Bergen', timezone: 'America/New_York' };

/// 9 to 5 Eastern on 30 September 2026 (EDT, so 13:00–21:00 UTC).
const shift = (over: Partial<NoticeShift> = {}): NoticeShift => ({
  employeeId: 'frankie',
  status: ShiftStatus.PUBLISHED,
  startsAt: new Date('2026-09-30T13:00:00Z'),
  endsAt: new Date('2026-09-30T21:00:00Z'),
  isRemote: false,
  location: northBergen,
  ...over,
});

describe('shiftNotices', () => {
  it('tells somebody about a new published shift, on the office clock', () => {
    expect(shiftNotices(null, shift())).toEqual([
      {
        employeeId: 'frankie',
        notice: expect.objectContaining({
          kind: 'SCHEDULE_CHANGED',
          title: 'New shift: Wed, Sep 30, 9:00 AM–5:00 PM',
          body: 'North Bergen.',
          link: '/schedule',
        }),
      },
    ]);
  });

  it('says nothing about drafts, or about open shifts', () => {
    expect(shiftNotices(null, shift({ status: ShiftStatus.DRAFT }))).toEqual([]);
    expect(shiftNotices(null, shift({ employeeId: null }))).toEqual([]);
  });

  it('treats publishing a draft as a new shift', () => {
    const notices = shiftNotices(shift({ status: ShiftStatus.DRAFT }), shift());
    expect(notices.map((n) => n.notice.title)).toEqual(['New shift: Wed, Sep 30, 9:00 AM–5:00 PM']);
  });

  it('tells both people when a shift moves from one to another', () => {
    const notices = shiftNotices(shift(), shift({ employeeId: 'max' }));
    expect(notices.map((n) => [n.employeeId, n.notice.title])).toEqual([
      ['frankie', 'Shift removed: Wed, Sep 30, 9:00 AM–5:00 PM'],
      ['max', 'New shift: Wed, Sep 30, 9:00 AM–5:00 PM'],
    ]);
  });

  it('says what it was when the times change', () => {
    const [notice] = shiftNotices(
      shift(),
      shift({ startsAt: new Date('2026-09-30T14:00:00Z'), isRemote: true }),
    );
    expect(notice.notice.title).toBe('Shift changed: Wed, Sep 30, 10:00 AM–5:00 PM');
    expect(notice.notice.body).toBe(
      'Work from home (North Bergen). Was Wed, Sep 30, 9:00 AM–5:00 PM, North Bergen.',
    );
  });

  it('gives the note with a new shift', () => {
    const [notice] = shiftNotices(null, shift({ notes: '9–12 upstairs, 12–5 downstairs' }));
    expect(notice.notice.body).toBe('North Bergen. Note: 9–12 upstairs, 12–5 downstairs');
  });

  it('tells them when only the note changes, or goes', () => {
    const [changed] = shiftNotices(shift({ notes: 'Upstairs' }), shift({ notes: 'Downstairs' }));
    expect(changed.notice.title).toBe('Shift note changed: Wed, Sep 30, 9:00 AM–5:00 PM');
    expect(changed.notice.body).toBe('North Bergen. Note: Downstairs');

    const [added] = shiftNotices(shift(), shift({ notes: 'Upstairs' }));
    expect(added.notice.title).toBe('Shift note changed: Wed, Sep 30, 9:00 AM–5:00 PM');

    const [removed] = shiftNotices(shift({ notes: 'Upstairs' }), shift({ notes: null }));
    expect(removed.notice.title).toBe('Shift note removed: Wed, Sep 30, 9:00 AM–5:00 PM');
    expect(removed.notice.body).toBe('North Bergen. It no longer has a note.');
  });

  it('puts a changed note in the one notice when the times change too', () => {
    const notices = shiftNotices(
      shift(),
      shift({ startsAt: new Date('2026-09-30T14:00:00Z'), notes: 'Downstairs' }),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].notice.body).toBe(
      'North Bergen. Was Wed, Sep 30, 9:00 AM–5:00 PM, North Bergen. Note: Downstairs',
    );
  });

  it('says nothing about a note on a draft', () => {
    const draft = { status: ShiftStatus.DRAFT };
    expect(shiftNotices(shift(draft), shift({ ...draft, notes: 'Upstairs' }))).toEqual([]);
  });

  it('says nothing when nothing they would notice changed', () => {
    expect(shiftNotices(shift(), shift())).toEqual([]);
  });

  it('tells them when a published shift is cancelled', () => {
    const notices = shiftNotices(shift(), null);
    expect(notices[0].notice.title).toBe('Shift removed: Wed, Sep 30, 9:00 AM–5:00 PM');
  });
});
