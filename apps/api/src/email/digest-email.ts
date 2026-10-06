import type { DigestContents } from './attention.service';

/**
 * The nightly round-up, as an email somebody wants to open (Dominguez, October
 * 2026: "it's very bland").
 *
 * What goes in it is still `AttentionService`'s — this is only how it reads:
 *
 * - **A subject that says what is in it**, most urgent first ("2 licenses have
 *   lapsed, next week isn't published and 3 more"), so the inbox alone says
 *   whether it can wait — the same "What needs a look today" every morning was
 *   easy to stop seeing.
 * - **Sorted by how soon**: *Sort out today* (broken now, or a deadline that
 *   has arrived), *Coming up* (a date ahead), *When you have a minute*
 *   (housekeeping). The counts for each sit at the top.
 * - **Each section links to the screen that fixes it**, with the same banner on
 *   it. At most `SHOWN_PER_SECTION` lines each; the rest are counted, and are
 *   on that screen.
 * - **How to turn it off**, at the bottom, which every recurring email owes.
 *
 * Plain text is still the message; the HTML is the same words laid out, as for
 * the welcome email.
 */

export interface DigestEmail {
  subject: string;
  text: string;
  html: string;
}

export interface DigestDetails {
  firstName: string;
  contents: DigestContents;
  appUrl: string;
  /// When it is being sent — for the date and "Good morning". Practice time.
  now?: Date;
  /// A test deployment says so in the subject; this is only for the heading.
  isTest?: boolean;
}

type Tier = 'today' | 'soon' | 'later';
type Key = keyof DigestContents;

interface SectionSpec {
  key: Key;
  tier: Tier;
  heading: string;
  /// The screen the banner for it is on, and what that screen is called.
  path: string;
  screen: string;
  /// For the subject line, given how many lines there are.
  subject: (count: number) => string;
}

/// Lines per section before "and N more". The email is read on a phone first
/// thing; a dozen of one problem pushes everything else out of sight.
export const SHOWN_PER_SECTION = 5;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/// In order of how soon, and within each tier roughly in the order somebody
/// would act. The headings follow the banners on the screens, with a little
/// more said where the screen supplies the rest ("Already lapsed" on Licenses).
const SECTIONS: SectionSpec[] = [
  {
    key: 'silentKiosks',
    tier: 'today',
    heading: 'A tablet has stopped being used',
    path: '/kiosks',
    screen: 'Kiosks',
    subject: (n) => `${n} kiosk ${plural(n, 'tablet has', 'tablets have')} gone quiet`,
  },
  {
    key: 'unpublishedRota',
    tier: 'today',
    heading: 'Next week is not published yet',
    path: '/schedule',
    screen: 'Schedule',
    subject: () => 'next week isn’t published',
  },
  {
    key: 'shiftsForLeavers',
    tier: 'today',
    heading: 'Shifts for people who have left',
    path: '/schedule',
    screen: 'Schedule',
    subject: () => 'shifts for somebody who has left',
  },
  {
    key: 'expiredCredentials',
    tier: 'today',
    heading: 'Licenses that have lapsed',
    path: '/credentials',
    screen: 'Licenses',
    subject: (n) => `${n} ${plural(n, 'license has', 'licenses have')} lapsed`,
  },
  {
    key: 'missingPunches',
    tier: 'today',
    // Forgotten clock-outs: closed at midnight by the app since October 2026,
    // and listed here until a manager puts in the real time.
    heading: 'Clock-outs to correct',
    path: '/timesheet',
    screen: 'Timesheet',
    subject: (n) => `${n} ${plural(n, 'clock-out', 'clock-outs')} to correct`,
  },
  {
    key: 'undecidedTimeOff',
    tier: 'soon',
    heading: 'Time off waiting on a decision',
    path: '/time-off',
    screen: 'Time off',
    subject: (n) => `${n} time-off ${plural(n, 'request', 'requests')} to decide`,
  },
  {
    key: 'openShifts',
    tier: 'soon',
    heading: 'Open shifts nobody is on yet',
    path: '/schedule',
    screen: 'Schedule',
    subject: () => 'open shifts to fill',
  },
  {
    key: 'shiftsInClosures',
    tier: 'soon',
    heading: 'Shifts while an office is closed',
    path: '/schedule',
    screen: 'Schedule',
    subject: () => 'shifts on a closed day',
  },
  {
    key: 'expiringCredentials',
    tier: 'soon',
    heading: 'Licenses lapsing in the next 60 days',
    path: '/credentials',
    screen: 'Licenses',
    subject: (n) => `${n} ${plural(n, 'license', 'licenses')} lapsing soon`,
  },
  {
    key: 'unapprovedHours',
    tier: 'soon',
    heading: 'Hours nobody has approved yet',
    path: '/timesheet',
    screen: 'Timesheet',
    subject: () => 'hours to approve',
  },
  {
    key: 'closingGaps',
    tier: 'later',
    heading: 'Closing checklists with something missed',
    path: '/closing',
    screen: 'Closing checklists',
    subject: (n) => `${n} closing ${plural(n, 'checklist', 'checklists')} with gaps`,
  },
  {
    key: 'suppliesNeeded',
    tier: 'later',
    heading: 'Supplies to order',
    path: '/closing',
    screen: 'Closing checklists',
    subject: () => 'supplies to order',
  },
  {
    key: 'newSuggestions',
    tier: 'soon',
    heading: 'In the suggestion box',
    path: '/surveys',
    screen: 'Surveys',
    subject: () => 'something in the suggestion box',
  },
  {
    key: 'handEntries',
    tier: 'later',
    heading: 'Hours entered by hand — find out why',
    path: '/timesheet',
    screen: 'Timesheet',
    subject: (n) => `${n} hand ${plural(n, 'entry', 'entries')} to look into`,
  },
  {
    key: 'missingCredentials',
    tier: 'later',
    heading: 'Required licenses not on file',
    path: '/credentials',
    screen: 'Licenses',
    subject: (n) => `${n} required ${plural(n, 'license', 'licenses')} not on file`,
  },
  {
    key: 'overdueTasks',
    tier: 'later',
    heading: 'Checklist tasks past their due date',
    path: '/checklists',
    screen: 'Onboarding & Offboarding',
    subject: (n) => `${n} overdue checklist ${plural(n, 'task', 'tasks')}`,
  },
];

/// `lead` is how a count reads in the subject and the summary: "4 to sort out
/// today · 12 coming up".
const TIERS: { tier: Tier; title: string; lead: string; colour: string; wash: string }[] = [
  {
    tier: 'today',
    title: 'Sort out today',
    lead: 'to sort out today',
    colour: '#b91c1c',
    wash: '#fef2f2',
  },
  { tier: 'soon', title: 'Coming up', lead: 'coming up', colour: '#b45309', wash: '#fffbeb' },
  {
    tier: 'later',
    title: 'When you have a minute',
    lead: 'for when you have a minute',
    colour: '#475569',
    wash: '#f8fafc',
  },
];

interface Filled extends SectionSpec {
  lines: string[];
}

export function digestEmail(details: DigestDetails): DigestEmail {
  const filled: Filled[] = SECTIONS.map((spec) => ({
    ...spec,
    lines: details.contents[spec.key],
  })).filter((section) => section.lines.length > 0);

  const appUrl = details.appUrl.replace(/\/$/, '');
  const now = details.now ?? new Date();
  const counts = TIERS.map(({ tier }) =>
    filled.filter((s) => s.tier === tier).reduce((sum, s) => sum + s.lines.length, 0),
  );

  return {
    subject: subjectFor(filled, counts),
    text: text(details.firstName, filled, counts, appUrl, now),
    html: html(details, filled, counts, appUrl, now),
  };
}

/// How many there are in the most pressing tier, then the first two things in
/// it by name: "4 to sort out today: next week isn’t published, 1 license has
/// lapsed". The count is of lines, like the tiles at the top.
function subjectFor(filled: Filled[], counts: number[]): string {
  const index = counts.findIndex((count) => count > 0);
  if (index < 0) return 'Nothing needs a look today';
  const { tier, lead } = TIERS[index];
  const named = filled
    .filter((s) => s.tier === tier)
    .slice(0, 2)
    .map((s) => s.subject(s.lines.length));
  return `${counts[index]} ${lead}: ${named.join(', ')}`;
}

/// "Good morning" at 5am, when the job runs — but it can be run by hand.
function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function dateLine(now: Date): string {
  return now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/// "3 to sort out today · 5 coming up" — the tiers with something in them.
function summary(counts: number[]): string {
  const parts = TIERS.flatMap(({ lead }, index) =>
    counts[index] > 0 ? [`${counts[index]} ${lead}`] : [],
  );
  return parts.length === 0 ? 'Nothing to chase today.' : `${parts.join(' · ')}.`;
}

function more(section: Filled): number {
  return Math.max(0, section.lines.length - SHOWN_PER_SECTION);
}

function text(
  firstName: string,
  filled: Filled[],
  counts: number[],
  appUrl: string,
  now: Date,
): string {
  const body = [
    `${greeting(now)} ${firstName},`,
    '',
    `Here is what needs a look on ${dateLine(now)}: ${summary(counts)}`,
  ];

  for (const { tier, title } of TIERS) {
    const sections = filled.filter((s) => s.tier === tier);
    if (sections.length === 0) continue;
    body.push('', '', `${title.toUpperCase()}`, '='.repeat(title.length));
    for (const section of sections) {
      body.push('', `${section.heading} (${section.lines.length})`);
      body.push(...section.lines.slice(0, SHOWN_PER_SECTION).map((line) => `  • ${line}`));
      if (more(section) > 0) body.push(`  …and ${more(section)} more`);
      body.push(`  → ${section.screen}: ${appUrl}${section.path}`);
    }
  }

  body.push(
    '',
    '',
    '—',
    'Domi Staff',
    appUrl,
    '',
    'Every line here is also on the screen it belongs to. To stop this email, open',
    `Email settings: ${appUrl}/notifications`,
  );
  return body.join('\n');
}

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/// Every line is "Who — what"; the who is set in bold so a list can be scanned.
function lineHtml(line: string): string {
  const split = line.indexOf(' — ');
  if (split < 0) return escape(line);
  return `<strong>${escape(line.slice(0, split))}</strong> — ${escape(line.slice(split + 3))}`;
}

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = '#1e293b';
const SOFT = '#475569';
const MUTED = '#64748b';
const BRAND = '#3A6888';
const RULE = '#e2e8f0';

/// Tables and inline styles, because that is what mail clients honour.
function html(
  details: DigestDetails,
  filled: Filled[],
  counts: number[],
  appUrl: string,
  now: Date,
): string {
  const url = escape(appUrl);
  const preheader = `${summary(counts)} ${filled
    .slice(0, 3)
    .map((s) => s.heading)
    .join(' · ')}`;

  const tiles = TIERS.map(({ title, colour, wash }, index) => {
    const none = counts[index] === 0;
    return `<td width="33%" valign="top" style="padding:0 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${none ? '#f8fafc' : wash};border-radius:10px"><tr><td style="padding:12px 10px;text-align:center;font-family:${FONT}">
<div style="font-size:26px;line-height:1.1;font-weight:700;color:${none ? '#cbd5e1' : colour}">${counts[index]}</div>
<div style="margin-top:4px;font-size:12px;line-height:1.3;color:${none ? '#94a3b8' : colour};font-weight:600">${escape(title)}</div>
</td></tr></table></td>`;
  }).join('');

  const tiers = TIERS.map(({ tier, title, colour, wash }) => {
    const sections = filled.filter((s) => s.tier === tier);
    if (sections.length === 0) return '';
    const cards = sections
      .map((section) => {
        const extra = more(section);
        const items = section.lines
          .slice(0, SHOWN_PER_SECTION)
          .map(
            (line) =>
              `<tr><td valign="top" width="14" style="width:14px;padding:0 0 6px;font-size:14px;line-height:1.45;color:${colour}">•</td><td style="padding:0 0 6px;font-size:14px;line-height:1.45;color:${INK}">${lineHtml(line)}</td></tr>`,
          )
          .join('');
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid ${RULE};border-left:4px solid ${colour};border-radius:8px"><tr><td style="padding:14px 16px 10px;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:15px;font-weight:700;color:${INK};padding:0 0 8px">${escape(section.heading)}</td>
<td align="right" valign="top" style="padding:0 0 8px 8px;white-space:nowrap"><span style="display:inline-block;min-width:18px;padding:2px 8px;border-radius:999px;background:${wash};color:${colour};font-size:12px;font-weight:700;text-align:center">${section.lines.length}</span></td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
${extra > 0 ? `<p style="margin:0 0 6px;font-size:13px;color:${SOFT}">…and ${extra} more</p>` : ''}
<p style="margin:4px 0 4px"><a href="${url}${section.path}" style="color:${BRAND};font-size:14px;font-weight:600;text-decoration:none">Open ${escape(section.screen)} →</a></p>
</td></tr></table>`;
      })
      .join('\n');
    return `<h2 style="margin:28px 0 12px;font-family:${FONT};font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:${colour}">${escape(title)}</h2>
${cards}`;
  }).join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subjectFor(filled, counts))}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border-top:4px solid ${BRAND}"><tr><td style="padding:24px 24px 8px;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><img src="${url}/brand/domi-mark.png" alt="" width="32" height="32" style="display:inline-block;vertical-align:middle;border:0;margin-right:8px"><span style="vertical-align:middle;font-size:16px;color:${INK}"><strong>Domi</strong> Staff</span></td>
<td align="right" valign="middle" style="font-size:13px;color:${MUTED}">${escape(dateLine(now))}${details.isTest ? ' · <strong style="color:#b45309">Test site</strong>' : ''}</td>
</tr></table>
<h1 style="margin:22px 0 4px;font-size:22px;line-height:1.3;color:${INK}">${escape(greeting(now))}, ${escape(details.firstName)}</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:${SOFT}">Here is what needs a look across the practice today.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px"><tr>${tiles}</tr></table>
${tiers}
<p style="margin:24px 0 20px;text-align:center"><a href="${url}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px">Open Domi Staff</a></p>
</td></tr></table>
<p style="margin:16px 0 0;max-width:560px;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED}">Sent each morning to managers when something needs a look. Every line is also on the screen it belongs to, so nothing is lost by <a href="${url}/notifications" style="color:${MUTED}">turning this email off</a>.<br>Domi Staff · <a href="${url}" style="color:${MUTED}">${escape(appUrl.replace(/^https?:\/\//, ''))}</a></p>
</td></tr></table>
</body></html>`;
}
