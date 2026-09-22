/**
 * IP allow-list matching for the fallback clock-in check.
 *
 * Supports exact matches (IPv4 and IPv6) and IPv4 CIDR blocks such as
 * "203.0.113.0/24" — enough for an office's static IP or small block.
 * IPv6 CIDR is not supported; an IPv6 entry must be an exact match.
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    result = result * 256 + octet;
  }
  return result;
}

/// Express reports IPv4 clients as "::ffff:203.0.113.7" when listening on IPv6.
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  return mapped ? mapped[1] : trimmed;
}

function matchesCidr(ip: string, cidr: string): boolean {
  const [network, prefixRaw] = cidr.split('/');
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  const ipInt = ipv4ToInt(ip);
  const networkInt = ipv4ToInt(network);
  if (ipInt === null || networkInt === null) {
    return false;
  }

  // A /0 shift by 32 is undefined in JS bitwise ops, so handle it explicitly.
  if (prefix === 0) {
    return true;
  }

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) >>> 0 === (networkInt & mask) >>> 0;
}

export function isIpAllowed(ip: string | null | undefined, allowList: string[]): boolean {
  if (!ip || allowList.length === 0) {
    return false;
  }

  const candidate = normalizeIp(ip);
  return allowList.some((entry) => {
    const allowed = entry.trim();
    if (allowed.length === 0) {
      return false;
    }
    return allowed.includes('/')
      ? matchesCidr(candidate, allowed)
      : normalizeIp(allowed).toLowerCase() === candidate.toLowerCase();
  });
}
