import { BadRequestException } from '@nestjs/common';
import { first, sameHost, type RequestHeaders } from '../common/request-origin';

/**
 * Where a passkey request came from: the address the person is on
 * ("https://staff.domihealthcare.com") and the name a passkey is tied to
 * ("staff.domihealthcare.com").
 *
 * Read from the browser's own `Origin`, which has to name the host the
 * request was sent to (as `request-origin.ts` checks for anything that
 * changes something), so a passkey made on the live site works there and on
 * nothing else, and one made on a test machine works only there. Null when
 * the request did not come from a page on this host.
 */
export interface PasskeySite {
  origin: string;
  rpID: string;
}

export function passkeySite(headers: RequestHeaders): PasskeySite | null {
  const origin = first(headers['origin'])?.trim();
  if (!origin) return null;
  const hosts = [first(headers['host']), first(headers['x-forwarded-host'])?.split(',')[0]];
  if (!hosts.some((host) => sameHost(origin, host))) return null;
  try {
    const url = new URL(origin);
    return { origin: url.origin, rpID: url.hostname };
  } catch {
    return null;
  }
}

/// The site of a request that must have one: refused otherwise.
export function requireSite(headers: RequestHeaders): PasskeySite {
  const site = passkeySite(headers);
  if (!site) throw new BadRequestException('Face ID only works from the Domi Staff page itself.');
  return site;
}
