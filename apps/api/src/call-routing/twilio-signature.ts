import { createHmac, timingSafeEqual } from 'node:crypto';

/// The form fields of a Twilio request, as the body parser gives them.
export type TwilioParams = Record<string, string | string[] | undefined>;

/**
 * Twilio's X-Twilio-Signature: base64 of HMAC-SHA1, keyed by the auth token,
 * over the full address Twilio called followed by every POST field sorted by
 * name, each as name then value.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignature(authToken: string, url: string, params: TwilioParams): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? [...value].sort() : [value]) {
      data += key + one;
    }
  }
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

/// Whether the header is the signature of this request. Constant time.
export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: TwilioParams,
  header: string | undefined,
): boolean {
  if (!authToken || !header) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(header);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
