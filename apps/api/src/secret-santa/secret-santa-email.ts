import type { ExchangeWords } from './secret-santa';

/**
 * The Secret Santa email as HTML (27 November 2026, Dominguez: "is the email
 * more festive too?", and "just Domi", not Domi Healthcare): the Domi mark, a green-to-holly-red header with
 * snow and a tree, the name on a gift tag, their gift ideas, the details and
 * a button back to the page. The plain text beside it says the same, as for
 * every email this app sends.
 *
 * Tables and inline styles, because that is what mail clients honour; the
 * header's gradient has a solid green behind it for the clients that ignore
 * gradients (Outlook on Windows).
 */

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = '#1e293b';
const SOFT = '#475569';
const GREEN = '#065f46';
const RED = '#9f1239';
const HOLLY = '#be123c';

export interface SantaEmailDetails {
  exchange: ExchangeWords;
  firstName: string;
  /// Who they are buying for, and that person's gift ideas.
  recipient: { name: string };
  /// Somebody left or joined after the draw, so this is a new person.
  changed: boolean;
  appUrl: string;
  link: string;
}

export function santaEmailHtml(details: SantaEmailDetails): string {
  const { exchange, recipient } = details;
  const url = escape(details.appUrl);
  const p = (text: string, extra = '') =>
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:${INK};${extra}">${text}</p>`;
  const facts = [
    `🎁 Budget $${exchange.budgetDollars}`,
    exchange.when ? `📅 ${exchange.when}` : '📅 Day still to be set',
    ...(exchange.where ? [`📍 ${exchange.where}`] : []),
  ]
    .map(
      (fact) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 12px;border-radius:999px;background:#f1f5f9;font-size:13px;color:${INK}">${escape(fact)}</span>`,
    )
    .join('');

  const body = [
    p(`Hello ${escape(details.firstName)},`),
    p(
      details.changed
        ? `The people in ${escape(exchange.title)} have changed, so the person you are buying for has changed.`
        : `The names for ${escape(exchange.title)} have been drawn. Here is who you are buying for.`,
    ),
    // The gift tag.
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px"><tr><td align="center" style="padding:20px 16px;border:2px dashed ${HOLLY};border-radius:14px;background:#fff1f2">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${RED};font-weight:700">🎁 You are buying for</p>
<p style="margin:0;font-size:26px;line-height:1.25;font-weight:800;color:#881337">${escape(recipient.name)}</p>
</td></tr></table>`,
    // Where their gift ideas are: they change through the season, so the
    // email never copies them (Dominguez, 27 November 2026).
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="padding:14px 16px;border-radius:12px;background:#ecfdf5;border:1px solid #a7f3d0">
<p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${GREEN}">🎄 Their gift ideas</p>
<p style="margin:0;font-size:15px;line-height:1.5;color:${INK}">They can change them through the season, so the latest are always in Domi Staff: open Secret Santa and press <strong>Show who I drew</strong>.</p>
</td></tr></table>`,
    `<div style="margin:0 0 8px">${facts}</div>`,
    `<p style="margin:16px 0"><a href="${url}${escape(details.link)}" style="display:inline-block;background:${HOLLY};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:999px">Open Secret Santa</a></p>`,
    p(
      'Keep it a secret: nobody else is shown who you drew. If you forget on the day, an organizer can look it up for you, and you are told they did.',
      `font-size:13px;color:${SOFT}`,
    ),
    p('Happy Holidays from Domi! 🎄', 'margin-top:20px'),
  ].join('\n');

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="padding:18px 28px 14px;font-family:${FONT}"><img src="${url}/brand/domi-mark.png" alt="" width="32" height="32" style="display:inline-block;vertical-align:middle;border:0;margin-right:8px"><span style="vertical-align:middle;font-size:18px;font-weight:800;color:#3A6888">Domi</span></td></tr>
<tr><td bgcolor="${GREEN}" style="background:${GREEN};background-image:linear-gradient(135deg,#064e3b,#065f46 45%,${RED});padding:22px 28px;font-family:${FONT}">
<p style="margin:0 0 6px;font-size:14px;letter-spacing:0.3em;color:#d1fae5">❄ ✨ 🎄 ✨ ❄</p>
<p style="margin:0;font-size:24px;line-height:1.25;font-weight:800;color:#ffffff">🎅 ${escape(exchange.title)}</p>
</td></tr>
<tr><td style="padding:24px 28px 20px;font-family:${FONT}">
${body}
</td></tr></table>
<p style="margin:16px 0 0;font-family:${FONT};font-size:12px;color:#64748b">Domi Staff · <a href="${url}" style="color:#64748b">${escape(details.appUrl.replace(/^https?:\/\//, ''))}</a></p>
</td></tr></table>
</body></html>`;
}
