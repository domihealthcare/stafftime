import { seedRefusal } from './seed-guard';

const LOCAL = 'postgresql://stafftime:stafftime@localhost:5432/stafftime?schema=public';
const NEON =
  'postgresql://user:secret@ep-example-123.us-east-2.aws.neon.tech/neondb?sslmode=require';

describe('seedRefusal', () => {
  it('lets the seed run against a database on this computer', () => {
    expect(seedRefusal({ DATABASE_URL: LOCAL })).toBeNull();
    expect(seedRefusal({ DATABASE_URL: LOCAL.replace('localhost', '127.0.0.1') })).toBeNull();
    expect(seedRefusal({ DATABASE_URL: LOCAL, APP_ENVIRONMENT: 'test' })).toBeNull();
  });

  it('lets it run against the local Docker database by its service name', () => {
    expect(seedRefusal({ DATABASE_URL: LOCAL.replace('localhost', 'postgres') })).toBeNull();
  });

  it('refuses a hosted database, the live one included', () => {
    expect(seedRefusal({ DATABASE_URL: NEON })).toMatch(/not a database on this computer/);
    expect(seedRefusal({ DATABASE_URL: NEON, APP_ENVIRONMENT: 'test' })).toMatch(
      /SEED_NON_LOCAL_DATABASE/,
    );
  });

  it('never names the password from the address in its message', () => {
    expect(seedRefusal({ DATABASE_URL: NEON })).not.toContain('secret');
  });

  it('runs against another host only when asked on purpose, in a test environment', () => {
    expect(
      seedRefusal({ DATABASE_URL: NEON, APP_ENVIRONMENT: 'test', SEED_NON_LOCAL_DATABASE: 'yes' }),
    ).toBeNull();
    expect(seedRefusal({ DATABASE_URL: NEON, SEED_NON_LOCAL_DATABASE: 'yes' })).not.toBeNull();
  });

  it('never runs with APP_ENVIRONMENT=production, even locally', () => {
    expect(seedRefusal({ DATABASE_URL: LOCAL, APP_ENVIRONMENT: 'production' })).toMatch(
      /production/,
    );
  });

  it('refuses when it cannot tell where it would write', () => {
    expect(seedRefusal({})).toMatch(/DATABASE_URL/);
    expect(seedRefusal({ DATABASE_URL: 'not a url' })).toMatch(/DATABASE_URL/);
  });
});
