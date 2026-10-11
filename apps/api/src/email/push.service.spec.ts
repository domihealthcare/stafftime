import { BadRequestException } from '@nestjs/common';
import webpush, { WebPushError } from 'web-push';
import { checkEndpoint, PushService } from './push.service';

jest.mock('web-push', () => {
  const actual = jest.requireActual('web-push');
  return { __esModule: true, ...actual, default: { ...actual, sendNotification: jest.fn() } };
});

const sendNotification = webpush.sendNotification as unknown as jest.Mock;

function build(keys = true) {
  const prisma = {
    pushKeys: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'd1', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' },
        { id: 'd2', endpoint: 'https://web.push.apple.com/xyz', p256dh: 'p', auth: 'a' },
      ]),
      update: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const config = {
    get: (name: string) =>
      keys
        ? ({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' } as Record<string, string>)[name]
        : undefined,
  };
  return { service: new PushService(prisma as never, config as never), prisma };
}

describe('PushService', () => {
  beforeEach(() => sendNotification.mockReset());

  it('does nothing until it is switched on', async () => {
    const { service, prisma } = build(false);
    await service.send(['emp'], { title: 'Hi' });
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect((await service.status('emp')).available).toBe(false);
  });

  it('switching on makes the app its own key pair, once', async () => {
    const { service, prisma } = build(false);
    await service.switchOn('admin');
    const saved = prisma.pushKeys.upsert.mock.calls[0][0];
    expect(saved.create.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(saved.update).toEqual({});
  });

  it('sends the words and link to each device', async () => {
    const { service } = build();
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await service.send(['emp'], { title: 'Shift changed', body: 'Tue 9–5', link: '/schedule' });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({
      title: 'Shift changed',
      body: 'Tue 9–5',
      link: '/schedule',
    });
  });

  it('forgets a device the push service says is gone, and never throws', async () => {
    const { service, prisma } = build();
    sendNotification
      .mockRejectedValueOnce(new WebPushError('Gone', 410, {}, '', 'https://fcm.googleapis.com/x'))
      .mockRejectedValueOnce(new Error('network down'));
    await expect(service.send(['emp'], { title: 'Hi' })).resolves.toBeUndefined();
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 'd1' } });
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('only sends to real push services', () => {
    expect(() => checkEndpoint('https://web.push.apple.com/abc')).not.toThrow();
    expect(() => checkEndpoint('https://fcm.googleapis.com/fcm/send/abc')).not.toThrow();
    expect(() =>
      checkEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'),
    ).not.toThrow();
    expect(() => checkEndpoint('http://fcm.googleapis.com/x')).toThrow(BadRequestException);
    expect(() => checkEndpoint('https://169.254.169.254/latest')).toThrow(BadRequestException);
    expect(() => checkEndpoint('https://evil.example.com/googleapis.com')).toThrow(
      BadRequestException,
    );
  });
});
