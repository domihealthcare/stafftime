import { VoiceService, decodeSteps } from './voice.service';
import { DEFAULT_MESSAGES } from './default-messages';
import type { RoutingPlan } from './routing-plan';

const ON_CALL = { employeeId: 'e1', name: 'Dr. Dominguez', phone: '+12015550101' };
const BACKUP = { employeeId: 'e2', name: 'Dr. Badia', phone: '+12015550102' };
const DEFAULT_P = { employeeId: 'e3', name: 'Dr. Iparraguirre', phone: '+12015550103' };

function plan(extra: Partial<RoutingPlan> = {}): RoutingPlan {
  return { onCall: ON_CALL, backup: null, fallback: null, source: 'USUAL', problems: [], ...extra };
}

function build(
  options: {
    plan?: RoutingPlan | Error | 'hang';
    env?: Record<string, string>;
    dbFails?: boolean;
    messages?: { key: string; text: string; audioUrl: string | null }[];
  } = {},
) {
  const env: Record<string, string> = {
    TWILIO_PHONE_NUMBER: '+12015559999',
    ONCALL_FALLBACK_PHONE: '(201) 555-0188',
    ...options.env,
  };
  const prisma = {
    callRoutingSettings: {
      findUnique: options.dbFails
        ? jest.fn().mockRejectedValue(new Error('db down'))
        : jest.fn().mockResolvedValue({
            voiceEn: 'Polly.Joanna-Neural',
            voiceEs: 'Polly.Lupe-Neural',
            ringSeconds: 25,
          }),
    },
    callMessage: { findMany: jest.fn().mockResolvedValue(options.messages ?? []) },
  };
  const planned = options.plan ?? plan();
  const routing = {
    planAt: jest.fn(() =>
      planned === 'hang'
        ? new Promise<never>(() => undefined)
        : planned instanceof Error
          ? Promise.reject(planned)
          : Promise.resolve(planned),
    ),
  };
  const callLog = {
    start: jest.fn().mockResolvedValue(undefined),
    setLanguage: jest.fn().mockResolvedValue(undefined),
    addAttempt: jest.fn().mockResolvedValue(undefined),
    beginAttempt: jest.fn().mockResolvedValue(undefined),
    endAttempt: jest.fn().mockResolvedValue(undefined),
    recordAcceptance: jest.fn().mockResolvedValue(undefined),
    finish: jest.fn().mockResolvedValue(undefined),
    markCallerHungUp: jest.fn().mockResolvedValue({ updated: true, tried: true }),
    sendMissedCallAlert: jest.fn().mockResolvedValue(true),
    markStep: jest.fn().mockResolvedValue(undefined),
    stepResult: jest.fn().mockResolvedValue(null),
  };
  const config = { get: (key: string) => env[key] };
  const service = new VoiceService(
    prisma as never,
    routing as never,
    callLog as never,
    config as never,
  );
  return { service, prisma, routing, callLog };
}

/// A step address's time, as Twilio would send it back now.
const NOW = () => String(Math.floor(Date.now() / 1000));

const queryOf = (xml: string, attr: 'action' | 'url'): URLSearchParams => {
  const match = new RegExp(`${attr}="[^"?]*\\?([^"]*)"`).exec(xml);
  return new URLSearchParams((match?.[1] ?? '').replace(/&amp;/g, '&'));
};

/// Pretend Twilio called the dial action of the first Dial in `xml`.
const dialQuery = (xml: string) => Object.fromEntries(queryOf(xml, 'action'));

function allXml(xml: string) {
  expect(xml).not.toContain('<Record');
  expect(xml).not.toContain('speech');
  for (const dialTag of xml.match(/<Dial [^>]*>/g) ?? []) {
    expect(dialTag).toContain('record="do-not-record"');
  }
  return xml;
}

describe('VoiceService', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  describe('incoming', () => {
    it('logs the call and plays both openings in a keypad menu', async () => {
      const { service, callLog } = build();
      const xml = allXml(await service.incoming({ CallSid: 'CA1', From: '+12015550142' }));
      expect(callLog.start).toHaveBeenCalledWith('CA1', '+12015550142');
      for (const part of [
        '<Gather input="dtmf"',
        'numDigits="1"',
        'timeout="5"',
        'action="language?try=1"',
      ]) {
        expect(xml).toContain(part);
      }
      expect(xml.indexOf('For English, press 1')).toBeLessThan(xml.indexOf('Para español'));
      expect(xml).toContain('voice="Polly.Lupe-Neural" language="es-US"');
      expect(xml).toMatch(/<\/Gather><Redirect method="POST">language\?try=1<\/Redirect>/);
    });

    it('keeps no number for a withheld caller', async () => {
      const { service, callLog } = build();
      await service.incoming({ CallSid: 'CA1', From: 'anonymous' });
      expect(callLog.start).toHaveBeenCalledWith('CA1', null);
    });

    it('still answers when the log write fails', async () => {
      const { service, callLog } = build();
      callLog.start.mockRejectedValue(new Error('db'));
      expect(await service.incoming({ CallSid: 'CA1', From: '+12015550142' })).toContain('<Gather');
    });

    it('plays a recording when the message has one', async () => {
      const { service } = build({
        messages: [{ key: 'OPENING_EN', text: 'x', audioUrl: 'https://assets.example/open.mp3' }],
      });
      const xml = await service.incoming({ CallSid: 'CA1' });
      expect(xml).toContain('<Play>https://assets.example/open.mp3</Play>');
    });
  });

  describe('language', () => {
    it('English: English greeting only, then the on-call with the whisper', async () => {
      const { service, callLog } = build();
      const xml = allXml(
        await service.language({ CallSid: 'CA1', Digits: '1', To: '+12015558888' }, { try: '1' }),
      );
      expect(xml).toContain('Domi Healthcare on-call provider');
      expect(xml).not.toContain('proveedor de guardia');
      expect(xml).toContain('callerId="+12015559999"');
      expect(xml).toContain('timeout="25"');
      expect(xml).toMatch(
        /<Number url="whisper\?lang=en&amp;t=\d+&amp;s=1&amp;e=e1" method="POST">\+12015550101<\/Number>/,
      );
      expect(callLog.setLanguage).toHaveBeenCalledWith('CA1', 'en', false);
    });

    it('Spanish: Spanish greeting only and a Spanish whisper', async () => {
      const { service } = build();
      const xml = await service.language({ CallSid: 'CA1', Digits: '2' }, { try: '1' });
      expect(xml).toContain('proveedor de guardia');
      expect(xml).not.toContain('Domi Healthcare on-call provider');
      expect(queryOf(xml, 'url').get('lang')).toBe('es');
      expect(service.whisper({ lang: 'es', t: NOW() })).toContain('Spanish-speaking caller');
      expect(service.whisper({ lang: 'en', t: NOW() })).toContain('English-speaking caller');
    });

    it('no input twice means English', async () => {
      const { service } = build();
      const xml = await service.language({ CallSid: 'CA1' }, { try: '2' });
      expect(xml).toContain('Domi Healthcare on-call provider');
    });

    it('an invalid key the first time replays the menu', async () => {
      const { service, routing } = build();
      const xml = await service.language({ CallSid: 'CA1', Digits: '7' }, { try: '1' });
      expect(xml).toContain('action="language?try=2"');
      expect(routing.planAt).not.toHaveBeenCalled();
      const second = await service.language({ CallSid: 'CA1', Digits: '7' }, { try: '2' });
      expect(second).toContain('Domi Healthcare on-call provider');
    });

    it('callerId falls back to the number that was called', async () => {
      const { service } = build({ env: { TWILIO_PHONE_NUMBER: '' } });
      const xml = await service.language({ CallSid: 'CA1', Digits: '1', To: '+12015558888' }, {});
      expect(xml).toContain('callerId="+12015558888"');
    });

    it('uses the fail-safe phone when the schedule cannot be read', async () => {
      const { service, callLog } = build({ plan: new Error('db down') });
      const xml = allXml(await service.language({ CallSid: 'CA1', Digits: '1' }, {}));
      expect(xml).toContain('+12015550188');
      expect(xml).toContain('<Number url="whisper');
      expect(callLog.setLanguage).toHaveBeenCalledWith('CA1', 'en', true);
    });

    it('uses the fail-safe phone when the schedule is too slow', async () => {
      jest.useFakeTimers();
      try {
        const { service, callLog } = build({ plan: 'hang' });
        const pending = service.language({ CallSid: 'CA1', Digits: '1' }, {});
        await jest.advanceTimersByTimeAsync(3100);
        const xml = await pending;
        expect(xml).toContain('+12015550188');
        expect(callLog.setLanguage).toHaveBeenCalledWith('CA1', 'en', true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('fail-safe: whisper first, then the same phone with none', async () => {
      const { service } = build({ plan: new Error('x') });
      const first = await service.language({ CallSid: 'CA1', Digits: '1' }, {});
      const second = await service.dialResult(
        { CallSid: 'CA1', DialCallStatus: 'no-answer', DialBridged: 'false' },
        dialQuery(first),
      );
      expect(second).toContain('continue to hold');
      expect(second).toContain('timeout="45"');
      // The last ring only announces the call: no key to press.
      expect(queryOf(second, 'url').get('a')).toBe('1');
    });

    it('with nothing configured it says the closing words, never silence', async () => {
      const { service, callLog } = build({
        plan: new Error('x'),
        env: { ONCALL_FALLBACK_PHONE: '' },
      });
      const xml = allXml(await service.language({ CallSid: 'CA1', Digits: '1' }, {}));
      expect(xml).toContain('We could not reach the on-call provider');
      expect(xml).toContain('<Hangup/>');
      expect(xml).not.toContain('<Dial');
      expect(callLog.finish).toHaveBeenCalledWith('CA1', 'NOT_REACHED');
    });

    it('uses the default words when the messages cannot be read', async () => {
      const { service } = build({ dbFails: true });
      const xml = await service.language({ CallSid: 'CA1', Digits: '1' }, {});
      expect(xml).toContain(DEFAULT_MESSAGES.GREETING_EN.text.replace(/'/g, '&apos;'));
      expect(xml).toContain('timeout="20"');
    });
  });

  describe('the chain', () => {
    const full = plan({ backup: BACKUP, fallback: DEFAULT_P });

    async function walk(statuses: { status: string; bridged?: string }[], lang = '1') {
      const { service, callLog } = build({ plan: full });
      const pages = [await service.language({ CallSid: 'CA1', Digits: lang }, {})];
      for (const s of statuses) {
        const last = pages[pages.length - 1];
        pages.push(
          await service.dialResult(
            { CallSid: 'CA1', DialCallStatus: s.status, DialBridged: s.bridged ?? 'false' },
            dialQuery(last),
          ),
        );
      }
      return { pages, callLog, service };
    }

    it('a step that is not answered goes to the backup after a hold message', async () => {
      const { pages } = await walk([{ status: 'no-answer' }]);
      expect(pages[1]).toContain('Please continue to hold');
      expect(pages[1]).toContain('+12015550102');
      expect(pages[1]).toContain('<Number url');
    });

    it("hold message is in the caller's language", async () => {
      const { pages } = await walk([{ status: 'no-answer' }], '2');
      expect(pages[1]).toContain('permanezca en la línea');
    });

    it('the final on-call step has no whisper and rings 45 seconds', async () => {
      const { pages } = await walk([{ status: 'no-answer' }, { status: 'busy' }]);
      expect(pages[2]).toContain('+12015550101');
      expect(pages[2]).toContain('timeout="45"');
      expect(queryOf(pages[2], 'url').get('a')).toBe('1');
      allXml(pages[2]);
    });

    it('the last ring announces the call and connects by itself', () => {
      const { service } = build();
      const xml = service.whisper({ lang: 'es', a: '1', t: NOW() });
      expect(xml).toContain('Domi Healthcare after-hours call, Spanish-speaking caller.');
      expect(xml).not.toContain('<Gather');
      expect(xml).not.toContain('<Hangup');
    });

    it('the whisper offers 1 to accept and 2 for voicemail', () => {
      const { service } = build();
      expect(service.whisper({ lang: 'en', t: NOW(), s: '1' })).toContain(
        'Press 1 to accept, or 2 to send the caller to your voicemail.',
      );
    });

    it('2 on the whisper skips the backup and rings their voicemail', async () => {
      const { service, callLog } = build({ plan: full });
      const first = await service.language({ CallSid: 'CA1', Digits: '1' }, {});
      const whisperQuery = Object.fromEntries(queryOf(first, 'url'));
      const answered = await service.whisperAnswer(
        { Digits: '2', ParentCallSid: 'CA1' },
        whisperQuery,
      );
      expect(answered).toContain('<Hangup/>');
      expect(callLog.markStep).toHaveBeenCalledWith('CA1', 1, 'sent to voicemail');
      expect(callLog.recordAcceptance).not.toHaveBeenCalled();

      callLog.stepResult.mockResolvedValueOnce('sent to voicemail');
      const next = await service.dialResult(
        { CallSid: 'CA1', DialCallStatus: 'completed', DialBridged: 'false' },
        dialQuery(first),
      );
      // Their own phone again, not the backup, as the last ring.
      expect(next).toContain('+12015550101');
      expect(next).not.toContain('+12015550102');
      expect(next).toContain('timeout="45"');
      expect(queryOf(next, 'url').get('a')).toBe('1');
      expect(decodeSteps(dialQuery(next).p).map((s) => s.r)).toEqual([
        'ON_CALL',
        'FINAL',
        'DEFAULT',
      ]);
      expect(callLog.endAttempt).not.toHaveBeenCalled();
    });

    it('the default provider is rung after the final step, with the whisper', async () => {
      const { pages } = await walk([
        { status: 'no-answer' },
        { status: 'no-answer' },
        { status: 'completed' },
      ]);
      expect(pages[3]).toContain('+12015550103');
      expect(pages[3]).toContain('<Number url');
      expect(pages[3]).toContain('timeout="25"');
    });

    it('everybody failing gives the closing words, a hangup and one alert', async () => {
      const { pages, callLog } = await walk([
        { status: 'no-answer' },
        { status: 'no-answer' },
        { status: 'no-answer' },
        { status: 'failed' },
      ]);
      const last = allXml(pages[4]);
      expect(last).toContain('We could not reach the on-call provider');
      expect(last).toContain('<Hangup/>');
      expect(last).not.toContain('<Dial');
      expect(callLog.finish).toHaveBeenCalledWith('CA1', 'NOT_REACHED');
      expect(callLog.sendMissedCallAlert).toHaveBeenCalledTimes(1);
    });

    it('records each attempt with its result', async () => {
      const { callLog } = await walk([{ status: 'no-answer' }, { status: 'completed' }]);
      const begun = callLog.beginAttempt.mock.calls.map((c) => [c[1].role, c[1].result]);
      expect(begun).toEqual([
        ['ON_CALL', null],
        ['BACKUP', null],
        ['FINAL', null],
      ]);
      const results = callLog.endAttempt.mock.calls.map((c) => [c[1].role, c[1].result]);
      expect(results).toEqual([
        ['ON_CALL', 'no answer'],
        ['BACKUP', 'declined'],
      ]);
    });

    it('a bridged whisper step is accepted and hangs up', async () => {
      const { pages, callLog } = await walk([{ status: 'completed', bridged: 'true' }]);
      expect(pages[1]).toContain('<Hangup/>');
      expect(callLog.finish).toHaveBeenCalledWith('CA1', 'ACCEPTED', { acceptedById: 'e1' });
      expect(callLog.sendMissedCallAlert).not.toHaveBeenCalled();
    });

    it('a bridged no-whisper step rang through', async () => {
      const { callLog } = await walk([
        { status: 'no-answer' },
        { status: 'no-answer' },
        { status: 'completed', bridged: 'true' },
      ]);
      expect(callLog.finish).toHaveBeenCalledWith('CA1', 'RANG_THROUGH', { acceptedById: null });
    });

    it('a logging failure does not change the TwiML', async () => {
      const { service, callLog } = build({ plan: full });
      const first = await service.language({ CallSid: 'CA1', Digits: '1' }, {});
      callLog.endAttempt.mockRejectedValue(new Error('db'));
      callLog.beginAttempt.mockRejectedValue(new Error('db'));
      const next = await service.dialResult(
        { CallSid: 'CA1', DialCallStatus: 'no-answer' },
        dialQuery(first),
      );
      expect(next).toContain('+12015550102');
    });

    it('an unreadable plan falls to the fail-safe phone', async () => {
      const { service } = build();
      const xml = await service.dialResult(
        { CallSid: 'CA1', DialCallStatus: 'no-answer' },
        { p: 'garbage', i: '0', t: NOW() },
      );
      expect(xml).toContain('+12015550188');
      expect(xml).not.toContain('<Number url');
    });

    it('the fail-safe dial, once over, says the closing words and never dials again', async () => {
      const { service, callLog } = build();
      const first = await service.dialResult(
        { CallSid: 'CA1', DialCallStatus: 'no-answer' },
        { p: 'garbage', i: '0', t: NOW() },
      );
      for (const status of ['no-answer', 'completed']) {
        const next = await service.dialResult(
          { CallSid: 'CA1', DialCallStatus: status, DialBridged: 'false' },
          dialQuery(first),
        );
        expect(next).not.toContain('<Dial');
        expect(next).toContain('could not reach');
        expect(next).toContain('<Hangup/>');
      }
      expect(callLog.finish).toHaveBeenCalledWith('CA1', 'NOT_REACHED');
    });

    it('a step past the end of the plan finishes instead of dialling', async () => {
      const { service } = build({ plan: full });
      const first = await service.language({ CallSid: 'CA1', Digits: '1' }, {});
      const xml = await service.dialResult(
        { CallSid: 'CA1', DialCallStatus: 'no-answer' },
        { ...dialQuery(first), i: '9' },
      );
      expect(xml).not.toContain('<Dial');
      expect(xml).toContain('<Hangup/>');
    });

    it('an old or undated step address is a replay: hang up, write nothing', async () => {
      const { service, callLog } = build({ plan: full });
      const first = await service.language({ CallSid: 'CA1', Digits: '1' }, {});
      const old = String(Math.floor(Date.now() / 1000) - 5 * 3600);
      for (const query of [
        { ...dialQuery(first), t: old },
        { ...dialQuery(first), t: '' },
      ]) {
        const xml = await service.dialResult(
          { CallSid: 'CA1', DialCallStatus: 'no-answer' },
          query,
        );
        expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
      }
      expect(
        await service.whisperAnswer({ Digits: '1', ParentCallSid: 'CA1' }, { e: 'e1', t: old }),
      ).toContain('<Hangup/>');
      expect(callLog.endAttempt).not.toHaveBeenCalled();
      expect(callLog.recordAcceptance).not.toHaveBeenCalled();
    });

    it('answers in time with the fail-safe when the log hangs', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      try {
        const { service, callLog } = build({ plan: full });
        callLog.setLanguage.mockReturnValue(new Promise(() => undefined));
        callLog.beginAttempt.mockReturnValue(new Promise(() => undefined));
        const pending = service.language({ CallSid: 'CA1', Digits: '1' }, {});
        await jest.advanceTimersByTimeAsync(2500);
        const xml = await pending;
        expect(xml).toContain('+12015550101');
      } finally {
        jest.useRealTimers();
      }
    });

    it('a slow alert does not hold the closing words past the step limit', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      try {
        const { service, callLog } = build();
        callLog.sendMissedCallAlert.mockReturnValue(new Promise(() => undefined));
        const pending = service.dialResult(
          { CallSid: 'CA1', DialCallStatus: 'no-answer' },
          {
            l: 'en',
            i: '0',
            t: NOW(),
            p: Buffer.from(
              JSON.stringify([{ r: 'ON_CALL', n: 'Dr. A', id: 'e1', p: '+12015550101', w: 1 }]),
            ).toString('base64url'),
          },
        );
        await jest.advanceTimersByTimeAsync(6000);
        const xml = await pending;
        expect(xml).toContain('could not reach');
      } finally {
        jest.useRealTimers();
      }
    });

    it('carries only dialable phones in the query', async () => {
      const { service } = build({ plan: full });
      const xml = await service.language({ CallSid: 'CA1', Digits: '1' }, {});
      expect(decodeSteps(dialQuery(xml).p).map((s) => s.r)).toEqual([
        'ON_CALL',
        'BACKUP',
        'FINAL',
        'DEFAULT',
      ]);
      expect(() =>
        decodeSteps(Buffer.from('[{"r":"ON_CALL","p":"911"}]').toString('base64url')),
      ).toThrow();
    });
  });

  describe('whisper answer and status', () => {
    it('1 connects and records the acceptance', async () => {
      const { service, callLog } = build();
      const xml = await service.whisperAnswer(
        { Digits: '1', ParentCallSid: 'CA1' },
        { e: 'e1', t: NOW() },
      );
      expect(xml).toContain('<Response/>');
      expect(callLog.recordAcceptance).toHaveBeenCalledWith('CA1', 'e1');
    });

    it('anything else hangs up on the provider', async () => {
      const { service, callLog } = build();
      expect(
        await service.whisperAnswer({ Digits: '2', ParentCallSid: 'CA1' }, { t: NOW() }),
      ).toContain('<Hangup/>');
      expect(callLog.recordAcceptance).not.toHaveBeenCalled();
    });

    it('a caller hanging up after providers were tried sends the alert', async () => {
      const { service, callLog } = build();
      const xml = await service.status({ CallSid: 'CA1', CallStatus: 'completed' });
      expect(xml).toContain('<Response/>');
      expect(callLog.sendMissedCallAlert).toHaveBeenCalledWith('CA1', 'HUNG_UP');
    });

    it('a call nobody could be rung for still alerts somebody', async () => {
      const { service, callLog } = build({
        plan: plan({ onCall: null }),
        env: { ONCALL_FALLBACK_PHONE: '' },
      });
      const xml = await service.language({ CallSid: 'CA1', Digits: '1' }, {});
      expect(xml).toContain('could not reach');
      expect(callLog.sendMissedCallAlert).toHaveBeenCalledWith('CA1', 'NOBODY_TO_RING');
    });

    it('keeps no number for the stand-ins Twilio uses for a hidden caller', async () => {
      const { service, callLog } = build();
      await service.incoming({ CallSid: 'CA1', From: '+266696687' });
      expect(callLog.start).toHaveBeenCalledWith('CA1', null);
    });

    it('no alert when nobody had been tried, or the call was already settled', async () => {
      const { service, callLog } = build();
      callLog.markCallerHungUp.mockResolvedValueOnce({ updated: true, tried: false });
      await service.status({ CallSid: 'CA1', CallStatus: 'completed' });
      callLog.markCallerHungUp.mockResolvedValueOnce({ updated: false, tried: false });
      await service.status({ CallSid: 'CA1', CallStatus: 'completed' });
      await service.status({ CallSid: 'CA1', CallStatus: 'ringing' });
      expect(callLog.sendMissedCallAlert).not.toHaveBeenCalled();
    });
  });
});
