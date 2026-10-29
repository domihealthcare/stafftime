import type { ConfigService } from '@nestjs/config';
import { secureCookies, sessionCookieOptions } from './cookie';

// A stub, not a real ConfigService: that one prefers process.env, where Jest
// has already set NODE_ENV=test.
const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('secureCookies', () => {
  it('is on in production', () => {
    expect(
      secureCookies(config({ NODE_ENV: 'production', APP_URL: 'http://localhost:5173' })),
    ).toBe(true);
  });

  it('is on for an https address even if NODE_ENV is missing or wrong', () => {
    expect(secureCookies(config({ APP_URL: 'https://staff.domihealthcare.com' }))).toBe(true);
    expect(
      secureCookies(
        config({ NODE_ENV: 'development', APP_URL: 'HTTPS://staff.domihealthcare.com' }),
      ),
    ).toBe(true);
  });

  it('is off for local work over plain http', () => {
    expect(
      secureCookies(config({ NODE_ENV: 'development', APP_URL: 'http://localhost:5173' })),
    ).toBe(false);
    expect(secureCookies(config({ NODE_ENV: 'development' }))).toBe(false);
  });

  it('is what the session cookie carries, alongside httpOnly and SameSite', () => {
    const options = sessionCookieOptions(new Date(), true);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true });
  });
});
