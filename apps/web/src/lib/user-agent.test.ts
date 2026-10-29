import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './user-agent';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68',
  operaWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  homeScreenIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  firefoxIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
  edgeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/130.0.2849.80 Mobile/15E148 Safari/605.1.15',
  safariIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  edgeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.2849.80',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  headless:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
};

describe('describeUserAgent', () => {
  it.each([
    ['chromeWindows', 'Chrome', 'Windows'],
    ['edgeWindows', 'Edge', 'Windows'],
    ['operaWindows', 'Opera', 'Windows'],
    ['safariIphone', 'Safari', 'iPhone'],
    ['homeScreenIphone', 'Safari', 'iPhone'],
    ['chromeIphone', 'Chrome', 'iPhone'],
    ['firefoxIphone', 'Firefox', 'iPhone'],
    ['edgeIphone', 'Edge', 'iPhone'],
    ['safariIpad', 'Safari', 'iPad'],
    ['safariMac', 'Safari', 'Mac'],
    ['chromeAndroid', 'Chrome', 'Android'],
    ['edgeAndroid', 'Edge', 'Android'],
    ['samsungAndroid', 'Samsung Internet', 'Android'],
    ['firefoxAndroid', 'Firefox', 'Android'],
    ['firefoxLinux', 'Firefox', 'Linux'],
    ['chromebook', 'Chrome', 'Chromebook'],
    ['headless', 'Chrome', 'Linux'],
  ] as const)('%s is %s on %s', (name, browser, system) => {
    expect(describeUserAgent(UA[name])).toEqual({ browser, system });
  });

  it('says nothing it cannot tell', () => {
    expect(describeUserAgent(null)).toEqual({ browser: null, system: null });
    expect(describeUserAgent(undefined)).toEqual({ browser: null, system: null });
    expect(describeUserAgent('')).toEqual({ browser: null, system: null });
    expect(describeUserAgent('curl/8.4.0')).toEqual({ browser: null, system: null });
  });

  it('tells one half without the other', () => {
    expect(describeUserAgent('SomeBot/1.0 (Windows NT 10.0)')).toEqual({
      browser: null,
      system: 'Windows',
    });
  });
});
