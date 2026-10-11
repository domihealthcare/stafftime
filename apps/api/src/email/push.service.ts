import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush, { WebPushError } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

/// How long a push service keeps trying a phone that is off: a day, then the
/// bell still has it.
const TTL_SECONDS = 86_400;
/// Never long: the serverless function waits for every send.
const TIMEOUT_MS = 5_000;
/// Sent a few at a time, so a post to everybody does not take thirty round
/// trips one after another.
const AT_ONCE = 10;

/// Where a browser's push service lives. Anything else is refused, so a
/// signed-in person cannot point the server at an address of their choosing.
const PUSH_HOSTS = [
  '.googleapis.com', // Chrome, Edge on Android
  '.push.apple.com', // Safari, and Home Screen apps on an iPhone
  '.push.services.mozilla.com', // Firefox
  '.notify.windows.com', // Edge on Windows
];

interface Keys {
  publicKey: string;
  privateKey: string;
}

export interface PushMessage {
  title: string;
  body?: string;
  /// A path inside the app, opened when the notification is tapped.
  link?: string;
}

/**
 * Phone notifications (October 2026, Dominguez — from the survey of similar
 * apps, instead of texts: no Twilio, no carrier registration, no cost).
 * Whatever rings somebody's bell (`InboxService.notify`) is also pushed to
 * each device where they turned notifications on, through that browser's own
 * push service, encrypted end to end with the device's keys.
 *
 * On an iPhone this needs Domi Staff on the Home Screen (iOS 16.4 or later);
 * on Android and computers the browser is enough. Off until an admin
 * switches it on in Practice settings, which makes the app's key pair
 * (`PushKeys`); `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` win if set.
 *
 * Like the bell and the email, never throws: a shift change must not fail
 * because a phone was unreachable.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly fromEnv: Keys | null;
  private readonly subject: string;
  private stored: Keys | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    this.fromEnv = publicKey && privateKey ? { publicKey, privateKey } : null;
    this.subject =
      config.get<string>('VAPID_SUBJECT')?.trim() || 'mailto:office@domihealthcare.com';
  }

  /// The key pair: Vercel's, or the one made when an admin switched it on.
  private async keys(): Promise<Keys | null> {
    if (this.fromEnv) return this.fromEnv;
    // Kept once found; while there are none, asked again each time, since
    // another server may be the one an admin switched them on through.
    if (!this.stored) {
      this.stored = await this.prisma.pushKeys.findUnique({
        where: { singleton: 1 },
        select: { publicKey: true, privateKey: true },
      });
    }
    return this.stored;
  }

  /// An admin switches phone notifications on for the practice: the app
  /// makes its key pair, once.
  async switchOn(employeeId: string) {
    if (!(await this.keys())) {
      const made = webpush.generateVAPIDKeys();
      await this.prisma.pushKeys.upsert({
        where: { singleton: 1 },
        create: { singleton: 1, publicKey: made.publicKey, privateKey: made.privateKey },
        update: {},
      });
      this.logger.log(`Phone notifications switched on by ${employeeId}`);
    }
    return this.status(employeeId);
  }

  /// To every device of these people. Awaited, and never throws.
  async send(employeeIds: string[], message: PushMessage): Promise<void> {
    if (employeeIds.length === 0) return;
    try {
      const keys = await this.keys();
      if (!keys) return;
      const devices = await this.prisma.pushSubscription.findMany({
        where: { employeeId: { in: [...new Set(employeeIds)] } },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });
      const payload = JSON.stringify({
        title: message.title,
        body: message.body ?? '',
        link: message.link ?? '/',
      });
      for (let start = 0; start < devices.length; start += AT_ONCE) {
        await Promise.all(
          devices.slice(start, start + AT_ONCE).map((d) => this.sendOne(d, payload, keys)),
        );
      }
    } catch (error) {
      this.logger.error(
        `Phone notifications failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async sendOne(
    device: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: string,
    keys: Keys,
  ) {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        payload,
        {
          TTL: TTL_SECONDS,
          timeout: TIMEOUT_MS,
          vapidDetails: {
            subject: this.subject,
            publicKey: keys.publicKey,
            privateKey: keys.privateKey,
          },
        },
      );
      await this.prisma.pushSubscription.update({
        where: { id: device.id },
        data: { lastSentAt: new Date() },
      });
    } catch (error) {
      // Gone (unsubscribed, app removed, browser data cleared): forget it.
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: device.id } });
        return;
      }
      this.logger.warn(
        `A phone notification did not go: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // ------------------------------------------------------- this person's

  async status(employeeId: string) {
    const devices = await this.prisma.pushSubscription.findMany({
      where: { employeeId },
      select: { id: true, device: true, createdAt: true, lastSentAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const keys = await this.keys();
    return { available: keys !== null, publicKey: keys?.publicKey ?? null, devices };
  }

  /// This device, for this person. A shared device that changes hands moves
  /// to whoever turned it on last.
  async subscribe(
    employeeId: string,
    input: { endpoint: string; keys: { p256dh: string; auth: string }; device?: string },
  ) {
    if (!(await this.keys())) {
      throw new BadRequestException(
        'Phone notifications are not switched on for the practice yet.',
      );
    }
    checkEndpoint(input.endpoint);
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        employeeId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        device: input.device?.slice(0, 60) || null,
      },
      update: {
        employeeId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        device: input.device?.slice(0, 60) || null,
      },
    });
    return this.status(employeeId);
  }

  async unsubscribe(employeeId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { employeeId, endpoint } });
    return this.status(employeeId);
  }

  /// "Send me a test" — to every device of theirs.
  async test(employeeId: string) {
    await this.send([employeeId], {
      title: 'Phone notifications are on',
      body: 'This is how Domi Staff will tell you about your shifts, time off and more.',
      link: '/notifications',
    });
    return this.status(employeeId);
  }
}

export function checkEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BadRequestException('That is not a push address.');
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((host) => url.hostname.endsWith(host))) {
    throw new BadRequestException('That is not a push service this app sends to.');
  }
}
