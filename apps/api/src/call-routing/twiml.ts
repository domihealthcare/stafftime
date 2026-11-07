/**
 * TwiML built by hand. Every piece of text and every attribute goes through
 * escapeXml. Nothing here records, transcribes or listens for speech.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

import { spokenLanguage } from '../on-call/call-voices';

type Attrs = Record<string, string | number | undefined>;

function tag(name: string, attrs: Attrs = {}, inner?: string): string {
  const text = Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
    .join('');
  return inner === undefined ? `<${name}${text}/>` : `<${name}${text}>${inner}</${name}>`;
}

export type Lang = 'en' | 'es';

/// What the caller hears: a recording when there is one, else the words.
export interface Spoken {
  text: string;
  audioUrl?: string | null;
}

export function say(text: string, voice: string): string {
  return tag('Say', { voice, language: spokenLanguage(voice) }, escapeXml(text));
}

export function speak(message: Spoken, voice: string): string {
  if (message.audioUrl) return tag('Play', {}, escapeXml(message.audioUrl));
  return say(message.text, voice);
}

export function response(...parts: string[]): string {
  const inner = parts.join('');
  return `<?xml version="1.0" encoding="UTF-8"?>${inner ? `<Response>${inner}</Response>` : '<Response/>'}`;
}

export const hangup = (): string => tag('Hangup');

export const redirect = (url: string): string =>
  tag('Redirect', { method: 'POST' }, escapeXml(url));

export function gather(
  attrs: { action: string; timeout: number; numDigits: number },
  inner: string,
): string {
  return tag('Gather', { input: 'dtmf', ...attrs, method: 'POST' }, inner);
}

export function dial(opts: {
  action: string;
  timeout: number;
  callerId?: string;
  number: string;
  whisperUrl?: string;
}): string {
  const number = tag(
    'Number',
    { url: opts.whisperUrl, method: opts.whisperUrl ? 'POST' : undefined },
    escapeXml(opts.number),
  );
  return tag(
    'Dial',
    {
      answerOnBridge: 'true',
      timeout: opts.timeout,
      callerId: opts.callerId,
      record: 'do-not-record',
      action: opts.action,
      method: 'POST',
    },
    number,
  );
}
