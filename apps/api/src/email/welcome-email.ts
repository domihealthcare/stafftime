/**
 * The welcome email: the one message every new starter gets, with the link to
 * choose a first password and — asked for by Dominguez, September 2026 — the
 * things people otherwise ask on day one: how to put the app on their phone,
 * how clocking in works, where the schedule is.
 *
 * Plain text is the message, as for every email this app sends; the HTML is
 * the same words laid out, for mail clients that show it. The wording matches
 * the screens it points at (Clock, Schedule, Time off, Your profile, Help), so
 * nobody goes looking for a button that is called something else.
 */

export interface WelcomeEmail {
  subject: string;
  text: string;
  html: string;
}

export interface WelcomeDetails {
  firstName: string;
  email: string;
  link: string;
  validDays: number;
  appUrl: string;
}

interface Section {
  title: string;
  lines: string[];
}

const FAQS: [string, string][] = [
  [
    'How do I clock in?',
    'On your phone: open Domi Staff and press the big Clock in button. At the office you can also use the front-desk time clock — pick your name and type your PIN.',
  ],
  [
    'Why does it ask for my location?',
    'Only when you press Clock in or Clock out on your phone, to check you are at the office. It is not tracked at any other time. If you are working from home, your manager marks that shift and no location is asked for.',
  ],
  [
    'When am I working?',
    'Schedule shows your shifts — Month shows the weeks ahead. You can add them to your phone’s calendar from the same screen.',
  ],
  [
    'I forgot to clock in or out.',
    'Tell your manager; they can put it right. Never clock in or out for somebody else.',
  ],
  [
    'How do I ask for time off?',
    'Time off → ask for the days. Your manager approves it and you get an email either way.',
  ],
  [
    'What is the checklist when I clock out?',
    'Front Desk and Medical Assistants get their end-of-day checklist. Tick what you did — you can always clock out, even with something left.',
  ],
  [
    'Where is everything else?',
    'Tap your picture or initials at the top right → Help for the full guide. Your profile is where you add a photo and your phone number.',
  ],
];

function sections(details: WelcomeDetails): Section[] {
  return [
    {
      title: '1. Choose your password',
      lines: [
        `Your sign-in is this email address, ${details.email}. Choose your password here:`,
        details.link,
        `The link works once, for ${details.validDays} days. If it has run out, open ${details.appUrl}, choose “Forgotten your password?” and enter your email.`,
      ],
    },
    {
      title: '2. Put Domi Staff on your phone',
      lines: [
        `It sits on your home screen like an app — nothing to download from an app store. Open ${details.appUrl}, then:`,
        'iPhone, in Safari: tap Share (the square with an arrow, at the bottom), then Add to Home Screen.',
        'iPhone, in Chrome: tap Share in the address bar at the top, then Add to Home Screen.',
        'Android, in Chrome: tap ⋮ at the top right, then Add to Home screen or Install app.',
      ],
    },
    {
      title: '3. Choose your time clock PIN',
      lines: [
        'For the front-desk time clock: tap your picture or initials at the top right → Your profile → Tablet PIN. Pick 4 to 8 digits you will remember and nobody would guess.',
      ],
    },
  ];
}

export function welcomeEmail(details: WelcomeDetails): WelcomeEmail {
  const subject = 'Welcome to Domi Staff — choose your password';
  const intro = [
    `Hello ${details.firstName},`,
    'Domi Healthcare now uses Domi Staff to clock in and out, check your schedule, ask for time off and keep up with the team.',
  ];

  const text = [
    ...intro.flatMap((line) => [line, '']),
    ...sections(details).flatMap((section) => [
      section.title.toUpperCase(),
      ...section.lines,
      '',
    ]),
    'COMMON QUESTIONS',
    ...FAQS.flatMap(([question, answer]) => [question, answer, '']),
    'Welcome aboard,',
    'Domi Healthcare',
  ].join('\n');

  return { subject, text, html: html(details, intro) };
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/// Tables and inline styles, because that is what mail clients honour.
function html(details: WelcomeDetails, intro: string[]): string {
  const ink = '#1e293b';
  const soft = '#475569';
  const brand = '#3A6888';
  const p = (text: string, extra = '') =>
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:${ink};${extra}">${text}</p>`;

  const [password, phone, pin] = sections(details);
  const body = [
    `<img src="${escape(details.appUrl)}/brand/domi-healthcare-slogan.png" alt="Domi Healthcare — Your Health. Your Family. Your Home." width="220" style="display:block;margin:0 0 20px;border:0;height:auto">`,
    ...intro.map((line) => p(escape(line))),
    `<h2 style="margin:24px 0 8px;font-size:17px;color:${ink}">${escape(password.title)}</h2>`,
    p(escape(password.lines[0])),
    `<p style="margin:16px 0"><a href="${escape(details.link)}" style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">Choose my password</a></p>`,
    p(escape(password.lines[2]), `font-size:13px;color:${soft}`),
    `<h2 style="margin:24px 0 8px;font-size:17px;color:${ink}">${escape(phone.title)}</h2>`,
    p(escape(phone.lines[0])),
    `<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.5;color:${ink}">${phone.lines
      .slice(1)
      .map((line) => {
        const [where, how] = line.split(/:\s(.+)/);
        return `<li style="margin-bottom:4px"><strong>${escape(where)}:</strong> ${escape(how ?? '')}</li>`;
      })
      .join('')}</ul>`,
    `<h2 style="margin:24px 0 8px;font-size:17px;color:${ink}">${escape(pin.title)}</h2>`,
    p(escape(pin.lines[0])),
    `<h2 style="margin:28px 0 8px;font-size:17px;color:${ink}">Common questions</h2>`,
    ...FAQS.map(
      ([question, answer]) =>
        `<p style="margin:0 0 2px;font-size:15px;font-weight:600;color:${ink}">${escape(question)}</p>` +
        p(escape(answer), `color:${soft}`),
    ),
    p('Welcome aboard,<br>Domi Healthcare', 'margin-top:24px'),
  ].join('\n');

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border-top:4px solid ${brand}"><tr><td style="padding:28px 28px 20px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
${body}
</td></tr></table>
<p style="margin:16px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#64748b">Domi Staff · <a href="${escape(details.appUrl)}" style="color:#64748b">${escape(details.appUrl.replace(/^https?:\/\//, ''))}</a></p>
</td></tr></table>
</body></html>`;
}
