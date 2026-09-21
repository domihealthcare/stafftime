import { isIpAllowed, normalizeIp } from './ip.util';

describe('normalizeIp', () => {
  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('leaves plain addresses alone', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
  });
});

describe('isIpAllowed', () => {
  it('matches an exact address', () => {
    expect(isIpAllowed('203.0.113.7', ['203.0.113.7'])).toBe(true);
  });

  it('matches through an IPv4-mapped address', () => {
    expect(isIpAllowed('::ffff:203.0.113.7', ['203.0.113.7'])).toBe(true);
  });

  it('matches inside a CIDR block', () => {
    expect(isIpAllowed('203.0.113.42', ['203.0.113.0/24'])).toBe(true);
  });

  it('rejects outside a CIDR block', () => {
    expect(isIpAllowed('203.0.114.42', ['203.0.113.0/24'])).toBe(false);
  });

  it('handles a /32 as a single host', () => {
    expect(isIpAllowed('203.0.113.7', ['203.0.113.7/32'])).toBe(true);
    expect(isIpAllowed('203.0.113.8', ['203.0.113.7/32'])).toBe(false);
  });

  it('treats /0 as matching any IPv4 address', () => {
    expect(isIpAllowed('8.8.8.8', ['0.0.0.0/0'])).toBe(true);
  });

  it('denies when the allow-list is empty', () => {
    expect(isIpAllowed('203.0.113.7', [])).toBe(false);
  });

  it('denies when there is no IP to check', () => {
    expect(isIpAllowed(null, ['203.0.113.0/24'])).toBe(false);
    expect(isIpAllowed(undefined, ['203.0.113.0/24'])).toBe(false);
  });

  it('ignores malformed allow-list entries rather than throwing', () => {
    expect(isIpAllowed('203.0.113.7', ['not-an-ip', '203.0.113.7'])).toBe(true);
    expect(isIpAllowed('203.0.113.7', ['203.0.113.0/99'])).toBe(false);
    expect(isIpAllowed('203.0.113.7', ['999.0.0.0/8'])).toBe(false);
  });

  it('matches IPv6 exactly, case-insensitively', () => {
    expect(isIpAllowed('2001:DB8::1', ['2001:db8::1'])).toBe(true);
  });
});
