import type { DigestContents } from './attention.service';
import { SHOWN_PER_SECTION, digestEmail } from './digest-email';

const empty = (): DigestContents => ({
  expiredCredentials: [],
  expiringCredentials: [],
  missingCredentials: [],
  overdueTasks: [],
  missingPunches: [],
  undecidedTimeOff: [],
  silentKiosks: [],
  unpublishedRota: [],
  unapprovedHours: [],
  handEntries: [],
  shiftsForLeavers: [],
  openShifts: [],
  shiftsInClosures: [],
  closingGaps: [],
  suppliesNeeded: [],
});

const appUrl = 'https://staff.domihealthcare.com';
// 5am in New Jersey, when the nightly job runs.
const now = new Date('2026-10-01T09:00:00Z');

function build(contents: Partial<DigestContents>) {
  return digestEmail({ firstName: 'Morgan', contents: { ...empty(), ...contents }, appUrl, now });
}

describe('digestEmail', () => {
  it('names the most urgent things in the subject, not the same words every day', () => {
    const { subject } = build({
      undecidedTimeOff: ['Frankie Front — Nov 3, 2026'],
      expiredCredentials: [
        'Pat Provider — BLS, expired Sep 2, 2026',
        'Sam Smith — DEA, expired Sep 9, 2026',
      ],
      unpublishedRota: ['North Bergen — nothing scheduled for the week of Oct 5, 2026'],
      suppliesNeeded: ['North Bergen — 1 to order: gloves'],
    });
    // The rota and licenses are "today"; time off and supplies wait, and are
    // not in the count.
    expect(subject).toBe('3 to sort out today: next week isn’t published, 2 licenses have lapsed');
  });

  it('leads with the next tier down when nothing is for today', () => {
    expect(build({ suppliesNeeded: ['North Bergen — 1 to order: gloves'] }).subject).toBe(
      '1 for when you have a minute: supplies to order',
    );
    expect(
      build({
        undecidedTimeOff: ['A — Nov 3', 'B — Nov 4'],
        suppliesNeeded: ['North Bergen — 1 to order: gloves'],
      }).subject,
    ).toBe('2 coming up: 2 time-off requests to decide');
  });

  it('sorts sections by how soon they need doing, and counts each tier', () => {
    const { text } = build({
      suppliesNeeded: ['North Bergen — 1 to order: gloves'],
      undecidedTimeOff: ['Frankie Front — Nov 3, 2026'],
      silentKiosks: ['West New York — the Front desk tablet was last used Sep 28, 2026'],
    });
    expect(text).toContain('Good morning Morgan,');
    expect(text).toContain('Thursday, October 1');
    expect(text).toContain('1 to sort out today · 1 coming up · 1 for when you have a minute.');
    const order = ['SORT OUT TODAY', 'COMING UP', 'WHEN YOU HAVE A MINUTE'].map((h) =>
      text.indexOf(h),
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('leaves out empty sections and empty tiers entirely', () => {
    const { text, html } = build({
      missingPunches: ['Frankie Front — clocked in Sep 29, 2026 and never out'],
    });
    expect(text).not.toContain('COMING UP');
    expect(text).not.toContain('Supplies to order');
    expect(html).not.toContain('Supplies to order');
  });

  it('links each section to the screen that fixes it, and says how to turn it off', () => {
    const { text, html } = build({
      expiringCredentials: ['Pat Provider — BLS, expires Nov 2, 2026'],
      overdueTasks: ['Nina New — W-4 collected, due Sep 20, 2026'],
    });
    expect(text).toContain(`→ Licenses: ${appUrl}/credentials`);
    expect(text).toContain(`→ Onboarding & Offboarding: ${appUrl}/checklists`);
    expect(text).toContain(`${appUrl}/notifications`);
    expect(html).toContain(`href="${appUrl}/credentials"`);
    expect(html).toContain(`href="${appUrl}/notifications"`);
  });

  it(`shows ${SHOWN_PER_SECTION} lines a section and counts the rest`, () => {
    const lines = Array.from({ length: SHOWN_PER_SECTION + 3 }, (_, i) => `Person ${i} — late`);
    const { text, html } = build({ missingPunches: lines });
    expect(text).toContain(`Punches with no clock-out (${lines.length})`);
    expect(text).toContain(`Person ${SHOWN_PER_SECTION - 1} — late`);
    expect(text).not.toContain(`Person ${SHOWN_PER_SECTION} — late`);
    expect(text).toContain('…and 3 more');
    expect(html).toContain('…and 3 more');
  });

  it('escapes what people typed — a supply name or a hand-entry note is not markup', () => {
    const { html } = build({
      suppliesNeeded: ['North Bergen — 1 to order: <script>alert(1)</script> & "gloves"'],
    });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    // The person or place before the dash is set in bold, so a list scans.
    expect(html).toContain('<strong>North Bergen</strong>');
  });

  it('says it is the test site in the heading when it is', () => {
    const contents = { ...empty(), missingPunches: ['A — x'] };
    expect(digestEmail({ firstName: 'M', contents, appUrl, now, isTest: true }).html).toContain(
      'Test site',
    );
    expect(digestEmail({ firstName: 'M', contents, appUrl, now }).html).not.toContain('Test site');
  });

  it('greets by the practice’s time of day, not the server’s', () => {
    // 21:00 UTC is 5pm in New Jersey.
    const evening = digestEmail({
      firstName: 'M',
      contents: { ...empty(), missingPunches: ['A — x'] },
      appUrl,
      now: new Date('2026-10-01T21:00:00Z'),
    });
    expect(evening.text.startsWith('Good evening M,')).toBe(true);
  });
});
