/**
 * What a signed-in browser is, in words somebody recognises: "Chrome on
 * Windows", "Safari on iPhone". For "Where you're signed in" on Your profile
 * (October 2026), where somebody looks for the phone or computer they forgot
 * to sign out of.
 *
 * Read from the user agent the browser sent when it signed in. That is only a
 * good guess - a browser can say anything - so it is never used to decide
 * anything, only to describe. Either half is null when it cannot be told, and
 * the screen then says "A browser". Pure, so the words are put together (and
 * translated) by the caller.
 */
export interface UserAgentParts {
  browser: string | null;
  system: string | null;
}

export function describeUserAgent(userAgent: string | null | undefined): UserAgentParts {
  const ua = userAgent ?? '';
  return { browser: browserOf(ua), system: systemOf(ua) };
}

// Order matters: Edge, Opera and Samsung's browser all say "Chrome" and
// "Safari" too, and Chrome says "Safari", so the most particular comes first.
function browserOf(ua: string): string | null {
  if (/\bEdg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/\bOPR\/|\bOpera\b/.test(ua)) return 'Opera';
  if (/\bSamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/\b(Firefox|FxiOS)\//.test(ua)) return 'Firefox';
  if (/\b(Chrome|HeadlessChrome|CriOS|Chromium)\//.test(ua)) return 'Chrome';
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return 'Safari';
  // Domi Staff opened from an iPhone's Home Screen leaves "Safari" out, but it
  // is Safari underneath.
  if (/\b(iPhone|iPad|iPod)\b/.test(ua) && /AppleWebKit\//.test(ua)) return 'Safari';
  return null;
}

// iPhone and iPad before Mac, since both say "like Mac OS X"; Android before
// Linux, since Android says "Linux". An iPad set to ask for desktop sites
// says Macintosh and is shown as a Mac: there is nothing to tell them apart.
function systemOf(ua: string): string | null {
  if (/\biPhone\b|\biPod\b/.test(ua)) return 'iPhone';
  if (/\biPad\b/.test(ua)) return 'iPad';
  if (/\bAndroid\b/.test(ua)) return 'Android';
  if (/\bWindows\b/.test(ua)) return 'Windows';
  if (/\bCrOS\b/.test(ua)) return 'Chromebook';
  if (/\bMacintosh\b|\bMac OS X\b/.test(ua)) return 'Mac';
  if (/\bLinux\b/.test(ua)) return 'Linux';
  return null;
}
