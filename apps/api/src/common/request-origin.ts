/**
 * Whether a request that changes something came from Domi Staff itself
 * (October 2026, a security review).
 *
 * The session cookie is `sameSite=lax`, which keeps it off requests from other
 * sites. But a browser counts every `*.domihealthcare.com` address as the same
 * "site", the practice's Wix website (www.domihealthcare.com) included, so a
 * hidden form on any page there could post to staff.domihealthcare.com/api and
 * the browser would send the staff member's cookie with it. Two rules close
 * that, for POST, PUT, PATCH and DELETE (reads change nothing and pass):
 *
 * 1. Where it came from. A modern browser says, in `Sec-Fetch-Site`, whether
 *    the page that sent a request is this very origin (`same-origin`), typed in
 *    by the person (`none`), a sister subdomain (`same-site`) or anywhere else
 *    (`cross-site`); only the first two are let through. An older browser
 *    without it still sends `Origin` on a form post, which has to name this
 *    host. A request with neither is not from a browser page at all (curl,
 *    cron-job.org, Vercel's timer, the browser suites' own API calls), and no
 *    page can make a browser leave both out of a form post, so it passes: the
 *    session cookie is still what it needs to do anything.
 * 2. What it carries. The app only ever sends JSON, and an HTML form can only
 *    send urlencoded, multipart or text/plain bodies. So a request with a body
 *    must say it is `application/json`. A page on another site could only send
 *    that with fetch, which needs a CORS answer this API never gives.
 */

/// The methods that change something. GET, HEAD and OPTIONS never do here.
const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/// What `Sec-Fetch-Site` may say: this origin, or the person themselves.
const OWN_SITE = new Set(['same-origin', 'none']);

export type RequestHeaders = Record<string, string | string[] | undefined>;

export type RequestRefusal = {
  statusCode: 403 | 415;
  error: 'Forbidden' | 'Unsupported Media Type';
  message: string;
};

export const NOT_FROM_DOMI_STAFF =
  'This request did not come from Domi Staff itself, so it was refused.';
export const NOT_JSON = 'Domi Staff only accepts JSON here, so this request was refused.';

/**
 * Null when the request may go on, else the refusal to send back, shaped like
 * Nest's own errors. Header names are lower case, as Node gives them.
 */
export function refuseForgedRequest(
  method: string,
  headers: RequestHeaders,
): RequestRefusal | null {
  if (!CHANGES.has(method.toUpperCase())) return null;

  if (!fromOwnOrigin(headers)) {
    return { statusCode: 403, error: 'Forbidden', message: NOT_FROM_DOMI_STAFF };
  }

  if (hasBody(headers) && !isJson(first(headers['content-type']))) {
    return { statusCode: 415, error: 'Unsupported Media Type', message: NOT_JSON };
  }

  return null;
}

function fromOwnOrigin(headers: RequestHeaders): boolean {
  const site = first(headers['sec-fetch-site'])?.trim().toLowerCase();
  if (site) return OWN_SITE.has(site);

  const origin = first(headers['origin'])?.trim();
  if (!origin) return true; // Not a browser page: see rule 1 above.

  // The Origin must name the host this request was sent to. Behind Vercel the
  // Host header is already the public address. A proxy that rewrites Host
  // (the Vite dev server's, which points it at localhost:3000) leaves the
  // original in X-Forwarded-Host where it sets one, so either may match.
  // Neither can be chosen by a page on another site: a browser sets Host
  // itself, and a custom header on a cross-site request needs a CORS answer.
  const hosts = [first(headers['host']), first(headers['x-forwarded-host'])?.split(',')[0]];
  return hosts.some((host) => sameHost(origin, host));
}

function sameHost(origin: string, host: string | undefined): boolean {
  if (!host?.trim()) return false;
  try {
    const from = new URL(origin);
    if (from.protocol !== 'https:' && from.protocol !== 'http:') return false;
    // Read the host under the origin's own scheme, so ":443" on an https
    // origin compares equal to no port at all.
    return new URL(`${from.protocol}//${host.trim()}`).host === from.host;
  } catch {
    // "null" (a sandboxed frame, a file) and anything unreadable.
    return false;
  }
}

function hasBody(headers: RequestHeaders): boolean {
  if (first(headers['transfer-encoding'])) return true;
  const length = Number(first(headers['content-length']) ?? 0);
  return Number.isNaN(length) || length > 0;
}

function isJson(contentType: string | undefined): boolean {
  if (!contentType) return false;
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
