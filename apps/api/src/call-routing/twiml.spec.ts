import { dial, escapeXml, gather, hangup, redirect, response, say, speak } from './twiml';

describe('twiml', () => {
  it('escapes text and attributes', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;',
    );
    expect(say('Dr. <B> & co', 'Polly.Joanna-Neural')).toBe(
      '<Say voice="Polly.Joanna-Neural" language="en-US">Dr. &lt;B&gt; &amp; co</Say>',
    );
    expect(redirect('language?try=1&x=2')).toBe(
      '<Redirect method="POST">language?try=1&amp;x=2</Redirect>',
    );
  });

  it('uses the Spanish language tag for a Spanish voice', () => {
    expect(say('Hola', 'Polly.Lupe-Neural')).toContain('language="es-US"');
  });

  it('plays a recording instead of saying the words', () => {
    expect(speak({ text: 'hi', audioUrl: 'https://x.example/a.mp3?a=1&b=2' }, 'v')).toBe(
      '<Play>https://x.example/a.mp3?a=1&amp;b=2</Play>',
    );
  });

  it('builds an empty response and a hangup', () => {
    expect(response()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>');
    expect(response(hangup())).toContain('<Response><Hangup/></Response>');
  });

  it('builds a dial that never records', () => {
    const xml = dial({
      action: 'dial?a=1&b=2',
      timeout: 20,
      callerId: '+1201',
      number: '+1202',
      answeredUrl: 'https://x.example/answered?x=1&y=2',
    });
    expect(xml).toContain('record="do-not-record"');
    expect(xml).toContain('answerOnBridge="true"');
    expect(xml).toContain('action="dial?a=1&amp;b=2"');
    expect(xml).toContain(
      '<Number statusCallbackEvent="answered" statusCallback="https://x.example/answered?x=1&amp;y=2" statusCallbackMethod="POST">+1202</Number>',
    );
    expect(xml).not.toContain(' url=');
    expect(dial({ action: 'a', timeout: 45, number: '+1202' })).toContain('<Number>+1202</Number>');
  });

  it('builds a keypad-only gather', () => {
    const xml = gather({ action: 'language?try=1', timeout: 5, numDigits: 1 }, '');
    expect(xml).toContain('input="dtmf"');
    expect(xml).not.toContain('speech');
  });
});
