import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallOutcome } from '@prisma/client';
import { toE164 } from '../common/util/phone';
import { OnCallRoutingService } from '../on-call/on-call-routing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CallLogService, CallRole } from './call-log.service';
import {
  DEFAULT_MESSAGES,
  DEFAULT_RING_SECONDS,
  DEFAULT_VOICE_EN,
  DEFAULT_VOICE_ES,
} from './default-messages';
import type { RoutingPlan } from './routing-plan';
import { dial, gather, hangup, Lang, redirect, response, speak, Spoken, say } from './twiml';

type Form = Record<string, string | undefined>;

/// How long the schedule and the messages get before the fail-safe is used.
export const LOOKUP_TIMEOUT_MS = 3000;
/// How long a no-whisper step rings: long enough to reach the cell's voicemail.
const VOICEMAIL_RING_SECONDS = 45;

/// One try in the chain. Kept short: it travels in the query string.
interface Step {
  r: CallRole;
  n: string;
  id: string | null;
  p: string;
  w: 0 | 1;
}

interface Content {
  voiceEn: string;
  voiceEs: string;
  ringSeconds: number;
  messages: Record<string, Spoken>;
}

const ROLES: CallRole[] = ['ON_CALL', 'BACKUP', 'FINAL', 'DEFAULT', 'FALLBACK'];
const RESULTS: Record<string, string> = {
  'no-answer': 'no answer',
  busy: 'busy',
  failed: 'failed',
  canceled: 'canceled',
};

export function encodeSteps(steps: Step[]): string {
  return Buffer.from(JSON.stringify(steps), 'utf8').toString('base64url');
}

export function decodeSteps(value: string | undefined): Step[] {
  const parsed: unknown = JSON.parse(Buffer.from(value ?? '', 'base64url').toString('utf8'));
  if (!Array.isArray(parsed) || parsed.length > 8) throw new Error('bad steps');
  return parsed.map((raw: Partial<Step>) => {
    if (
      !raw ||
      !ROLES.includes(raw.r as CallRole) ||
      typeof raw.p !== 'string' ||
      !/^\+\d{8,15}$/.test(raw.p)
    ) {
      throw new Error('bad step');
    }
    return {
      r: raw.r as CallRole,
      n: String(raw.n ?? ''),
      id: typeof raw.id === 'string' ? raw.id : null,
      p: raw.p,
      w: raw.w ? 1 : 0,
    };
  });
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The after-hours line's call flow, as TwiML. The plan (who to ring, in what
 * order) is worked out once, then carried in each step's query string, so the
 * later steps need no database. Twilio signs the whole address, so it cannot
 * be changed on the way. Nothing here records or listens: no Record, no speech.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: OnCallRoutingService,
    private readonly callLog: CallLogService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------ the routes

  async incoming(body: Form): Promise<string> {
    const callSid = body.CallSid;
    if (callSid) {
      await this.quietly(this.callLog.start(callSid, this.callerNumber(body.From)));
    }
    const content = await this.content();
    return response(...this.menu(content, 1));
  }

  async language(body: Form, query: Form): Promise<string> {
    const digits = (body.Digits ?? '').trim();
    const content = await this.content();
    if (digits !== '1' && digits !== '2' && query.try === '1') {
      return response(...this.menu(content, 2));
    }
    const lang: Lang = digits === '2' ? 'es' : 'en';
    try {
      const { steps, usedFallback } = await this.plan();
      if (body.CallSid) {
        await this.quietly(this.callLog.setLanguage(body.CallSid, lang, usedFallback));
      }
      const greeting = speak(...this.message(content, 'GREETING', lang));
      if (steps.length === 0) {
        await this.finishUnreached(body.CallSid);
        return response(greeting, this.closing(content, lang), hangup());
      }
      return response(greeting, ...this.stepParts(steps, 0, lang, content, body.To));
    } catch (error) {
      this.logger.error(`Language step failed: ${(error as Error).message}`);
      return this.emergency(content, lang, body.To);
    }
  }

  /// Played to the provider when their cell answers.
  whisper(query: Form): string {
    const who = query.lang === 'es' ? 'Spanish-speaking caller' : 'English-speaking caller';
    const answer = `whisper-answer?${new URLSearchParams(this.carry(query)).toString()}`;
    return response(
      gather(
        { action: answer, timeout: 8, numDigits: 1 },
        say(`Domi Healthcare after-hours call, ${who}. Press 1 to accept.`, DEFAULT_VOICE_EN),
      ),
      hangup(),
    );
  }

  async whisperAnswer(body: Form, query: Form): Promise<string> {
    if ((body.Digits ?? '').trim() !== '1') return response(hangup());
    if (body.ParentCallSid) {
      await this.quietly(this.callLog.recordAcceptance(body.ParentCallSid, query.e ?? null));
    }
    return response();
  }

  async dialResult(body: Form, query: Form): Promise<string> {
    const lang: Lang = query.l === 'es' ? 'es' : 'en';
    const content = await this.content();
    let steps: Step[];
    try {
      steps = decodeSteps(query.p);
    } catch {
      this.logger.error('A dial step arrived without a readable plan.');
      return this.emergency(content, lang, body.To);
    }
    const index = Number.parseInt(query.i ?? '', 10);
    const step = steps[index];
    if (!step) return this.emergency(content, lang, body.To);
    const callSid = body.CallSid;

    try {
      const bridged = body.DialBridged === 'true';
      const status = body.DialCallStatus ?? '';
      const result = bridged
        ? step.w
          ? 'accepted'
          : 'rang through'
        : (RESULTS[status] ?? (status === 'completed' ? 'declined' : 'failed'));
      if (callSid) {
        await this.quietly(
          this.callLog.addAttempt(callSid, {
            step: index + 1,
            role: step.r,
            employeeId: step.id,
            name: step.n,
            result,
            at: new Date().toISOString(),
          }),
        );
      }
      if (bridged) {
        if (callSid) {
          await this.quietly(
            this.callLog.finish(callSid, step.w ? CallOutcome.ACCEPTED : CallOutcome.RANG_THROUGH, {
              acceptedById: step.w ? step.id : null,
            }),
          );
        }
        return response(hangup());
      }
      if (index + 1 < steps.length) {
        return response(...this.stepParts(steps, index + 1, lang, content, body.To));
      }
      await this.finishUnreached(callSid, true);
      return response(this.closing(content, lang), hangup());
    } catch (error) {
      this.logger.error(`Dial step failed: ${(error as Error).message}`);
      if (index + 1 < steps.length) {
        return response(...this.stepParts(steps, index + 1, lang, content, body.To));
      }
      return this.emergency(content, lang, body.To);
    }
  }

  /// The number's "call status changes" callback.
  async status(body: Form): Promise<string> {
    const ended = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];
    if (body.CallSid && ended.includes(body.CallStatus ?? '')) {
      try {
        const { updated, tried } = await this.callLog.markCallerHungUp(body.CallSid);
        if (updated && tried) await this.callLog.sendMissedCallAlert(body.CallSid);
      } catch (error) {
        this.logger.error(`Call status failed: ${(error as Error).message}`);
      }
    }
    return response();
  }

  // ---------------------------------------------------------------- pieces

  private menu(content: Content, attempt: 1 | 2): string[] {
    const again = `language?try=${attempt}`;
    return [
      gather(
        { action: again, timeout: 5, numDigits: 1 },
        speak(...this.message(content, 'OPENING', 'en')) +
          speak(...this.message(content, 'OPENING', 'es')),
      ),
      redirect(again),
    ];
  }

  /// The pieces for step `index`: the hold message (after the first), then the dial.
  private stepParts(
    steps: Step[],
    index: number,
    lang: Lang,
    content: Content,
    to?: string,
  ): string[] {
    const step = steps[index];
    if (!step) return [this.closing(content, lang), hangup()];
    const parts: string[] = [];
    if (index > 0) parts.push(speak(...this.message(content, 'HOLD', lang)));
    const query = new URLSearchParams({ l: lang, i: String(index), p: encodeSteps(steps) });
    const whisper = new URLSearchParams({ lang });
    if (step.id) whisper.set('e', step.id);
    parts.push(
      dial({
        action: `dial?${query.toString()}`,
        timeout: step.w ? content.ringSeconds : VOICEMAIL_RING_SECONDS,
        callerId: this.config.get<string>('TWILIO_PHONE_NUMBER') || to || undefined,
        number: step.p,
        whisperUrl: step.w ? `whisper?${whisper.toString()}` : undefined,
      }),
    );
    return parts;
  }

  /// Last resort when something went wrong: the fail-safe phone, else the closing words.
  private emergency(content: Content, lang: Lang, to?: string): string {
    const phone = toE164(this.config.get<string>('ONCALL_FALLBACK_PHONE'));
    if (!phone) return response(this.closing(content, lang), hangup());
    const steps: Step[] = [{ r: 'FALLBACK', n: 'Fail-safe phone', id: null, p: phone, w: 0 }];
    // Index 1 is past the end, so if it is not answered the closing words follow.
    const query = new URLSearchParams({ l: lang, i: '1', p: encodeSteps(steps) });
    return response(
      dial({
        action: `dial?${query.toString()}`,
        timeout: VOICEMAIL_RING_SECONDS,
        callerId: this.config.get<string>('TWILIO_PHONE_NUMBER') || to || undefined,
        number: phone,
      }),
    );
  }

  private closing(content: Content, lang: Lang): string {
    return speak(...this.message(content, 'CLOSING', lang));
  }

  private message(content: Content, kind: string, lang: Lang): [Spoken, string] {
    const key = `${kind}_${lang.toUpperCase()}`;
    const message = content.messages[key] ?? DEFAULT_MESSAGES[key];
    return [message, lang === 'es' ? content.voiceEs : content.voiceEn];
  }

  /// Keep the lang and the provider id when the whisper hands on to its answer.
  private carry(query: Form): Record<string, string> {
    const out: Record<string, string> = {};
    if (query.lang) out.lang = query.lang;
    if (query.e) out.e = query.e;
    return out;
  }

  private async finishUnreached(callSid: string | undefined, alert = false): Promise<void> {
    if (!callSid) return;
    await this.quietly(this.callLog.finish(callSid, CallOutcome.NOT_REACHED));
    if (alert) await this.quietly(this.callLog.sendMissedCallAlert(callSid));
  }

  private callerNumber(from: string | undefined): string | null {
    if (!from) return null;
    const e164 = toE164(from);
    if (e164) return e164;
    return /^\+\d{7,15}$/.test(from.trim()) ? from.trim() : null;
  }

  /// Who to ring, in order. The schedule gets 3 seconds; after that, or on an
  /// error, the fail-safe phone, or nobody.
  private async plan(): Promise<{ steps: Step[]; usedFallback: boolean }> {
    try {
      const plan = await withTimeout(this.routing.planAt(), LOOKUP_TIMEOUT_MS);
      const steps = this.stepsOf(plan);
      if (steps.length > 0) return { steps, usedFallback: false };
    } catch (error) {
      this.logger.error(`Could not read the on-call schedule: ${(error as Error).message}`);
    }
    const phone = toE164(this.config.get<string>('ONCALL_FALLBACK_PHONE'));
    if (!phone) return { steps: [], usedFallback: true };
    const name = 'Fail-safe phone';
    return {
      steps: [
        { r: 'FALLBACK', n: name, id: null, p: phone, w: 1 },
        { r: 'FALLBACK', n: name, id: null, p: phone, w: 0 },
      ],
      usedFallback: true,
    };
  }

  private stepsOf(plan: RoutingPlan): Step[] {
    const step = (r: CallRole, c: NonNullable<RoutingPlan['onCall']>, w: 0 | 1): Step => ({
      r,
      n: c.name,
      id: c.employeeId,
      p: c.phone,
      w,
    });
    const steps: Step[] = [];
    if (plan.onCall) steps.push(step('ON_CALL', plan.onCall, 1));
    if (plan.backup) steps.push(step('BACKUP', plan.backup, 1));
    if (plan.onCall) steps.push(step('FINAL', plan.onCall, 0));
    if (plan.fallback) steps.push(step('DEFAULT', plan.fallback, 1));
    return steps;
  }

  /// Messages, voices and the ring time; the defaults if they cannot be read in time.
  private async content(): Promise<Content> {
    const content: Content = {
      voiceEn: DEFAULT_VOICE_EN,
      voiceEs: DEFAULT_VOICE_ES,
      ringSeconds: DEFAULT_RING_SECONDS,
      messages: { ...DEFAULT_MESSAGES },
    };
    try {
      const [settings, rows] = await withTimeout(
        Promise.all([
          this.prisma.callRoutingSettings.findUnique({ where: { id: 1 } }),
          this.prisma.callMessage.findMany(),
        ]),
        LOOKUP_TIMEOUT_MS,
      );
      if (settings) {
        content.voiceEn = settings.voiceEn || content.voiceEn;
        content.voiceEs = settings.voiceEs || content.voiceEs;
        if (settings.ringSeconds > 0) content.ringSeconds = settings.ringSeconds;
      }
      for (const row of rows) {
        if (row.audioUrl || row.text.trim()) {
          content.messages[row.key] = { text: row.text, audioUrl: row.audioUrl };
        }
      }
    } catch (error) {
      this.logger.error(`Could not read the call messages: ${(error as Error).message}`);
    }
    return content;
  }

  /// A logging failure never changes what the caller hears.
  private async quietly(work: Promise<unknown>): Promise<void> {
    try {
      await work;
    } catch (error) {
      this.logger.warn(`Call log write failed: ${(error as Error).message}`);
    }
  }
}
