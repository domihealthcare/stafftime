import { isValidTwilioSignature, twilioSignature } from './twilio-signature';

// The worked example in Twilio's "Validating requests" page.
const URL_ = 'https://example.com/myapp.php?foo=1&bar=2';
const PARAMS = {
  CallSid: 'CA1234567890ABCDE',
  Caller: '+14158675310',
  Digits: '1234',
  From: '+14158675310',
  To: '+18005551212',
};
const SIGNATURE = 'L/OH5YylLD5NRKLltdqwSvS0BnU=';

describe('twilio signature', () => {
  it("matches the vector from Twilio's documentation", () => {
    expect(twilioSignature('12345', URL_, PARAMS)).toBe(SIGNATURE);
    expect(isValidTwilioSignature('12345', URL_, PARAMS, SIGNATURE)).toBe(true);
  });

  it('does not depend on the order the fields arrive in', () => {
    const shuffled = {
      To: PARAMS.To,
      Digits: PARAMS.Digits,
      CallSid: PARAMS.CallSid,
      From: PARAMS.From,
      Caller: PARAMS.Caller,
    };
    expect(isValidTwilioSignature('12345', URL_, shuffled, SIGNATURE)).toBe(true);
  });

  it('refuses a changed field, address, token or signature', () => {
    expect(isValidTwilioSignature('12345', URL_, { ...PARAMS, Digits: '9' }, SIGNATURE)).toBe(
      false,
    );
    expect(isValidTwilioSignature('12345', URL_, { ...PARAMS, Extra: 'x' }, SIGNATURE)).toBe(false);
    expect(isValidTwilioSignature('12345', `${URL_}&x=1`, PARAMS, SIGNATURE)).toBe(false);
    expect(isValidTwilioSignature('54321', URL_, PARAMS, SIGNATURE)).toBe(false);
    expect(isValidTwilioSignature('12345', URL_, PARAMS, `${SIGNATURE}x`)).toBe(false);
    expect(isValidTwilioSignature('12345', URL_, PARAMS, 'short')).toBe(false);
  });

  it('refuses a missing header or token', () => {
    expect(isValidTwilioSignature('12345', URL_, PARAMS, undefined)).toBe(false);
    expect(isValidTwilioSignature('12345', URL_, PARAMS, '')).toBe(false);
    expect(isValidTwilioSignature('', URL_, PARAMS, SIGNATURE)).toBe(false);
  });
});
