import { ConfigService } from '@nestjs/config';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { GoogleMeetService, MEET_SCOPE } from './google-meet.service';

// A throwaway key, made for this test run only.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'domi-staff-meet@domi-staff.iam.gserviceaccount.com',
  // As it arrives when pasted into a one-line setting: escaped line breaks.
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n'),
});

function service(settings: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    GOOGLE_SERVICE_ACCOUNT_JSON: KEY_JSON,
    GOOGLE_MEET_HOST: 'office@domihealthcare.com',
    ...settings,
  };
  return new GoogleMeetService({ get: (name: string) => values[name] } as unknown as ConfigService);
}

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('GoogleMeetService', () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url) =>
        String(url).includes('oauth2')
          ? reply(200, { access_token: 'token-1', expires_in: 3600 })
          : reply(200, { name: 'spaces/abc', meetingUri: 'https://meet.google.com/abc-defg-hij' }),
      );
  });
  afterEach(() => fetchMock.mockRestore());

  it('is off until both settings are there', () => {
    expect(service().available).toBe(true);
    expect(service({ GOOGLE_MEET_HOST: undefined }).available).toBe(false);
    expect(service({ GOOGLE_SERVICE_ACCOUNT_JSON: undefined }).available).toBe(false);
    expect(service({ GOOGLE_SERVICE_ACCOUNT_JSON: '{"not":"a key"}' }).available).toBe(false);
  });

  it('says so in words when it is not set up', async () => {
    await expect(service({ GOOGLE_MEET_HOST: undefined }).createLink()).rejects.toThrow(
      'Google Meet is not set up yet',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('acts as the practice account, for creating meetings and nothing else', async () => {
    await service().createLink();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(init.body as string);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');

    const [header, claims, signature] = form.get('assertion')!.split('.');
    const decoded = JSON.parse(Buffer.from(claims, 'base64url').toString());
    expect(decoded).toMatchObject({
      iss: 'domi-staff-meet@domi-staff.iam.gserviceaccount.com',
      sub: 'office@domihealthcare.com',
      scope: MEET_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
    });
    expect(decoded.exp - decoded.iat).toBe(3600);
    // Signed with the key, so Google can check it came from the app.
    const verified = createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(publicKey, signature, 'base64url');
    expect(verified).toBe(true);
  });

  it('makes a Trusted meeting: practice accounts walk in, others knock', async () => {
    const link = await service().createLink();
    expect(link).toBe('https://meet.google.com/abc-defg-hij');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://meet.googleapis.com/v2/spaces');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({ config: { accessType: 'TRUSTED' } });
  });

  it('signs in once and reuses it for the next link', async () => {
    const meet = service();
    await meet.createLink();
    await meet.createLink();
    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth2'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('explains a missing admin permission in plain words, and saves nothing', async () => {
    fetchMock.mockImplementation(async () =>
      reply(401, { error: 'unauthorized_client', error_description: 'Client is unauthorized' }),
    );
    await expect(service().createLink()).rejects.toThrow(
      'Google did not make a Meet link (the Workspace admin has not allowed the app to create meetings yet). Nothing was saved',
    );
  });

  it('says so when Google cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(service().createLink()).rejects.toThrow(
      'Google did not make a Meet link (Google could not be reached)',
    );
  });

  it('refuses anything back that is not an https meeting link', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('oauth2')
        ? reply(200, { access_token: 'token-1', expires_in: 3600 })
        : reply(200, { meetingUri: 'javascript:alert(1)' }),
    );
    await expect(service().createLink()).rejects.toThrow('Google did not make a Meet link');
  });
});
