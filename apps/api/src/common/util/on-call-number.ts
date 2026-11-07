import { BadRequestException } from '@nestjs/common';
import { toE164 } from './phone';

/// An on-call number as stored: a US number written the way Twilio dials it,
/// or null to fall back to the Directory phone. Undefined leaves it alone.
export function onCallNumber(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const text = (value ?? '').trim();
  if (!text) return null;
  const e164 = toE164(text);
  if (!e164) {
    throw new BadRequestException(
      'The on-call number has to be a ten-digit US number, for example (201) 555-0142.',
    );
  }
  return e164;
}
