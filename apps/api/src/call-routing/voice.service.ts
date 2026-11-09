import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallOutcome } from '@prisma/client';
import { toE164 } from '../common/util/phone';
import { OnCallRoutingService } from '../on-call/on-call-routing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CallLogService, CallRole } from './call-log.service';
import { DEFAULT_MESSAGES, DEFAULT_VOICE_EN, DEFAULT_VOICE_ES } from './default-messages';
import type { RoutingPlan } from './routing-plan';
import { dial, gather, hangup, Lang, redirect, response, speak, Spoken } from './twiml';

type Form = Record<string, string | undefined>;

/// How long the schedule and the messages get before the fail-safe is used.
/// They are read at the same time, so this is the wait, not twice it.
export const LOOKUP_TIMEOUT_MS = 3000;
/// A log write is never worth keeping a caller waiting for.
export const LOG_TIMEOUT_MS = 1000;
/// The missed-call alert (bell, phone, email) gets this long; the call has
/// already been answered with its closing words by then.
export const ALERT_TIMEOUT_MS = 4000;
/// A whole step must answer well inside Twilio's 15 seconds, cold start
/// included; past this it answers with the fail-safe instead.
export const STEP_TIMEOUT_MS = 8000;
/// A signed step address older than this is a replay, not a live call.
export const STEP_MAX_AGE_SECONDS = 4 * 60 * 60;
/// Twilio's stand-ins for a caller with no number to call back.
const NO_NUMBER = new Set(['+266696687', '+7378742833', '+2562533', '+8656696', '+86282452253']);
/// How long each ring lasts: long enough for an unanswered or declined call
/// to reach the cell's own voicemail.
export const RING_SECONDS = 45;

/// One try in the chain. Kept short: it travels in the query string.
interface Step {
  r: CallRole;
  n: string;
  id: string | null;
  p: string;
}

interface Content {
  voiceEn: string;
  voiceEs: string;
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
  //
  // Each route answers within STEP_TIMEOUT_MS whatever happens; past that, or
  // on any error, the fail-safe phone, else the closing words. Never silence.

  async incoming(body: Form): Promise<string> {
    return this.capped(async () => {
      const callSid = body.CallSid;
      if (callSid) {
        await this.quietly(() => this.callLog.start(callSid, this.callerNumber(body.From)));
      }
      const content = await this.content();
      return response(...this.menu(content, 1));
    }, body);
  }

  async language(body: Form, query: Form): Promise<string> {
    const digits = (body.Digits ?? '').trim();
    const lang: Lang = digits === '2' ? 'es' : 'en';
    return this.capped(
      async () => {
        if (digits !== '1' && digits !== '2' && query.try === '1') {
          return response(...this.menu(await this.content(), 2));
        }
        // The words and the plan at the same time: one wait, not two.
        const [content, { steps, usedFallback }] = await Promise.all([this.content(), this.plan()]);
        const callSid = body.CallSid;
        if (callSid) {
          await this.quietly(() => this.callLog.setLanguage(callSid, lang, usedFallback));
        }
        const greeting = speak(...this.message(content, 'GREETING', lang));
        if (steps.length === 0) {
          const closing = response(greeting, this.closing(content, lang), hangup());
          await this.finishUnreached(callSid);
          return closing;
        }
        const parts = this.stepParts(steps, 0, lang, content, body.To);
        await this.beginStep(callSid, steps, 0);
        return response(greeting, ...parts);
      },
      body,
      lang,
    );
  }

  /// Twilio says the provider's phone answered (them, or their voicemail).
  /// Nothing is played to that phone: the caller is put straight through, so
  /// one sent to voicemail hears the whole greeting (Dominguez, 9 November
  /// 2026, after the old "press 1" question and then a short announcement
  /// each got in the way of the voicemail). Writing it down means a caller
  /// who hangs up later is not taken for a missed call.
  async answered(body: Form, query: Form): Promise<string> {
    if (this.stale(query)) return response();
    const parent = body.ParentCallSid;
    if (parent && body.CallStatus === 'in-progress') {
      await this.quietly(() => this.callLog.recordAnswer(parent, query.e ?? null));
    }
    return response();
  }

  /// Kept only for a call already ringing when this version went live: it
  /// connects at once and says nothing.
  whisper(): string {
    return response();
  }

  async dialResult(body: Form, query: Form): Promise<string> {
    const lang: Lang = query.l === 'es' ? 'es' : 'en';
    if (this.stale(query)) return response(hangup());
    return this.capped(
      async () => {
        const content = await this.content();
        let steps: Step[];
        try {
          steps = decodeSteps(query.p);
        } catch {
          // Only an unreadable plan goes to the fail-safe phone.
          this.logger.error('A dial step arrived without a readable plan.');
          return this.emergency(content, lang, body.To);
        }
        const callSid = body.CallSid;
        const index = Number.parseInt(query.i ?? '', 10);
        const step = Number.isInteger(index) ? steps[index] : undefined;
        if (!step) {
          // Past the end of the plan (the fail-safe's own dial included): finish.
          const closing = response(this.closing(content, lang), hangup());
          await this.finishUnreached(callSid, true);
          return closing;
        }

        const bridged = body.DialBridged === 'true';
        const status = body.DialCallStatus ?? '';
        if (bridged) {
          // Settle the outcome first, so a status callback arriving at the
          // same moment never reads the call as missed.
          if (callSid) {
            await this.quietly(() =>
              this.callLog.finish(callSid, CallOutcome.RANG_THROUGH, { acceptedById: step.id }),
            );
            await this.quietly(() =>
              this.callLog.endAttempt(callSid, this.attempt(step, index, 'rang through')),
            );
          }
          return response(hangup());
        }

        const result = RESULTS[status] ?? (status === 'completed' ? 'declined' : 'failed');
        if (callSid) {
          await this.quietly(() =>
            this.callLog.endAttempt(callSid, this.attempt(step, index, result)),
          );
        }
        if (index + 1 < steps.length) {
          const parts = this.stepParts(steps, index + 1, lang, content, body.To);
          await this.beginStep(callSid, steps, index + 1);
          return response(...parts);
        }
        const closing = response(this.closing(content, lang), hangup());
        await this.finishUnreached(callSid, true);
        return closing;
      },
      body,
      lang,
    );
  }

  /// The number's "call status changes" callback. The caller hung up (or the
  /// call ended) while a step was still going: settle the log and, if a
  /// provider had been rung, tell them.
  async status(body: Form): Promise<string> {
    const ended = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];
    if (body.CallSid && ended.includes(body.CallStatus ?? '')) {
      try {
        const { updated, tried } = await withTimeout(
          this.callLog.markCallerHungUp(body.CallSid),
          LOOKUP_TIMEOUT_MS,
        );
        if (updated && tried) {
          await withTimeout(
            this.callLog.sendMissedCallAlert(body.CallSid, 'HUNG_UP'),
            ALERT_TIMEOUT_MS,
          );
        }
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
    const t = String(Math.floor(this.now() / 1000));
    const query = new URLSearchParams({ l: lang, i: String(index), p: encodeSteps(steps), t });
    const answered = new URLSearchParams({ t });
    if (step.id) answered.set('e', step.id);
    parts.push(
      dial({
        action: `dial?${query.toString()}`,
        timeout: RING_SECONDS,
        callerId: this.config.get<string>('TWILIO_PHONE_NUMBER') || to || undefined,
        number: step.p,
        answeredUrl: this.address(`answered?${answered.toString()}`),
      }),
    );
    return parts;
  }

  /// Last resort when something went wrong: the fail-safe phone, else the closing words.
  private emergency(content: Content, lang: Lang, to?: string): string {
    const phone = toE164(this.config.get<string>('ONCALL_FALLBACK_PHONE'));
    if (!phone) return response(this.closing(content, lang), hangup());
    const steps: Step[] = [{ r: 'FALLBACK', n: 'Fail-safe phone', id: null, p: phone }];
    // Its own step 0: when it ends, the dial route finds no step after it and
    // says the closing words. Never a second fail-safe dial.
    const t = String(Math.floor(this.now() / 1000));
    const query = new URLSearchParams({ l: lang, i: '0', p: encodeSteps(steps), t });
    return response(
      dial({
        action: `dial?${query.toString()}`,
        timeout: RING_SECONDS,
        callerId: this.config.get<string>('TWILIO_PHONE_NUMBER') || to || undefined,
        number: phone,
      }),
    );
  }

  /// Twilio's status callbacks want a whole address, not one relative to the
  /// step, so the base the signature is checked against goes in front.
  private address(route: string): string | undefined {
    const base = (this.config.get<string>('TWILIO_WEBHOOK_BASE_URL') ?? '').replace(/\/+$/, '');
    return base ? `${base}/api/call-routing/voice/${route}` : undefined;
  }

  private closing(content: Content, lang: Lang): string {
    return speak(...this.message(content, 'CLOSING', lang));
  }

  private message(content: Content, kind: string, lang: Lang): [Spoken, string] {
    const key = `${kind}_${lang.toUpperCase()}`;
    const message = content.messages[key] ?? DEFAULT_MESSAGES[key];
    return [message, lang === 'es' ? content.voiceEs : content.voiceEn];
  }

  /// Nobody could be reached: the log, and the alert (to the providers rung,
  /// else the default provider, else the admins) so the closing words' "they
  /// have been told" is true.
  private async finishUnreached(callSid: string | undefined, rang = false): Promise<void> {
    if (!callSid) return;
    await this.quietly(() => this.callLog.finish(callSid, CallOutcome.NOT_REACHED));
    await this.quietly(
      () => this.callLog.sendMissedCallAlert(callSid, rang ? 'NOT_REACHED' : 'NOBODY_TO_RING'),
      ALERT_TIMEOUT_MS,
    );
  }

  /// Write down the step being rung before Twilio rings it, so a caller who
  /// hangs up during it still counts as having reached a provider's phone.
  private async beginStep(callSid: string | undefined, steps: Step[], index: number) {
    const step = steps[index];
    if (!callSid || !step) return;
    await this.quietly(() => this.callLog.beginAttempt(callSid, this.attempt(step, index, null)));
  }

  private attempt(step: Step, index: number, result: string | null) {
    return {
      step: index + 1,
      role: step.r,
      employeeId: step.id,
      name: step.n,
      result,
      at: new Date(this.now()).toISOString(),
    };
  }

  /// A step address signed more than STEP_MAX_AGE_SECONDS ago, or with no
  /// time at all, is somebody replaying an old request: answer it with a
  /// hang-up and touch nothing.
  private stale(query: Form): boolean {
    const t = Number.parseInt(query.t ?? '', 10);
    if (!Number.isFinite(t)) return true;
    const age = this.now() / 1000 - t;
    return age > STEP_MAX_AGE_SECONDS || age < -300;
  }

  /// The clock, for tests.
  protected now(): number {
    return Date.now();
  }

  /// Runs a route with the whole-step limit. Past it, or on an error that got
  /// this far: the fail-safe phone with the default words.
  private async capped(work: () => Promise<string>, body: Form, lang: Lang = 'en') {
    try {
      return await withTimeout(work(), STEP_TIMEOUT_MS);
    } catch (error) {
      this.logger.error(`Phone line step failed: ${(error as Error).message}`);
      return this.emergency(this.defaults(), lang, body.To);
    }
  }

  private callerNumber(from: string | undefined): string | null {
    if (!from) return null;
    const e164 = toE164(from);
    if (e164) return e164;
    const trimmed = from.trim();
    if (NO_NUMBER.has(trimmed)) return null;
    return /^\+\d{7,15}$/.test(trimmed) ? trimmed : null;
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
      steps: [{ r: 'FALLBACK', n: name, id: null, p: phone }],
      usedFallback: true,
    };
  }

  /// One ring to the provider on call (their backup when they cannot be
  /// rung), long enough to reach their voicemail; the default provider only
  /// if that phone does not answer at all (Dominguez, 9 November 2026: "only
  /// ring the on-call provider 1 time").
  private stepsOf(plan: RoutingPlan): Step[] {
    const step = (r: CallRole, c: NonNullable<RoutingPlan['onCall']>): Step => ({
      r,
      n: c.name,
      id: c.employeeId,
      p: c.phone,
    });
    const steps: Step[] = [];
    if (plan.onCall) steps.push(step('ON_CALL', plan.onCall));
    if (plan.fallback) steps.push(step('DEFAULT', plan.fallback));
    return steps;
  }

  /// Messages and voices; the defaults if they cannot be read in time.
  private defaults(): Content {
    return {
      voiceEn: DEFAULT_VOICE_EN,
      voiceEs: DEFAULT_VOICE_ES,
      messages: { ...DEFAULT_MESSAGES },
    };
  }

  private async content(): Promise<Content> {
    const content = this.defaults();
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
  private async quietly(work: () => Promise<unknown>, ms = LOG_TIMEOUT_MS): Promise<void> {
    try {
      await withTimeout(work(), ms);
    } catch (error) {
      this.logger.warn(`Call log write failed: ${(error as Error).message}`);
    }
  }
}
