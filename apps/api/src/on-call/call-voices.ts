/// The voices a manager can pick for the after-hours line (Twilio <Say>,
/// neural Polly voices, United States).

export const ENGLISH_VOICES = [
  'Polly.Joanna-Neural',
  'Polly.Ruth-Neural',
  'Polly.Danielle-Neural',
  'Polly.Matthew-Neural',
  'Polly.Stephen-Neural',
] as const;

export const SPANISH_VOICES = [
  'Polly.Lupe-Neural',
  'Polly.Pedro-Neural',
  'Polly.Mia-Neural',
] as const;

export function isEnglishVoice(voice: string): boolean {
  return (ENGLISH_VOICES as readonly string[]).includes(voice);
}

export function isSpanishVoice(voice: string): boolean {
  return (SPANISH_VOICES as readonly string[]).includes(voice);
}

/// The language Twilio's <Say> wants with a voice.
export function spokenLanguage(voice: string): 'en-US' | 'es-US' | 'es-MX' {
  if (voice === 'Polly.Mia-Neural') return 'es-MX';
  if (isSpanishVoice(voice)) return 'es-US';
  return 'en-US';
}
