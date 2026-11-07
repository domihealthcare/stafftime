/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { EmploymentStatus, Role } from '@prisma/client';
import { whoIsOnCallAt } from './call-routing-lookup';
import { OnCallRoutingService } from './on-call-routing.service';

jest.mock('./call-routing-lookup', () => ({
  whoIsOnCallAt: jest.fn(),
  segmentsBetween: jest.fn(() => []),
}));

const NOW = new Date('2026-10-12T15:00:00.000Z');
const manager = { id: 'mgr', email: 'm@x', role: Role.MANAGER };
const employee = { id: 'emp', email: 'e@x', role: Role.EMPLOYEE };
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

function person(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    firstName: id === A ? 'Ann' : id === B ? 'Bo' : 'Cy',
    lastName: 'Doe',
    preferredName: null,
    postNominals: 'MD',
    photoUpdatedAt: null,
    phone: '(201) 555-0142',
    employmentStatus: EmploymentStatus.ACTIVE,
    isSharedAccount: false,
    ...over,
  };
}

function answer(over: Record<string, unknown> = {}) {
  (whoIsOnCallAt as jest.Mock).mockReturnValue({
    employeeId: A,
    backupEmployeeId: null,
    source: 'USUAL',
    coverId: null,
    turnDate: '2026-10-12',
    ...over,
  });
}

function build(
  people: any[],
  settings: any = { defaultProviderId: C },
  env: Record<string, string> = {},
) {
  const prisma: Record<string, any> = {
    onCallRota: { findMany: jest.fn().mockResolvedValue([]) },
    onCallDay: { findMany: jest.fn().mockResolvedValue([]) },
    onCallCover: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }) => ({
        id: 'c1',
        ...data,
        employee: person(data.employeeId),
        backup: data.backupEmployeeId ? person(data.backupEmployeeId) : null,
        setBy: null,
      })),
    },
    callRoutingSettings: {
      findUnique: jest.fn().mockResolvedValue(settings),
      upsert: jest.fn(),
    },
    callMessage: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    employee: {
      findMany: jest.fn(async () => people),
      count: jest.fn(
        async ({ where }) => (where.id.in as string[]).filter((id) => id !== 'bad').length,
      ),
    },
  };
  prisma.$transaction = jest.fn(async (work: (tx: unknown) => unknown) => work(prisma));
  const notifications = { onCall: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (key: string) => env[key] };
  return {
    service: new OnCallRoutingService(prisma as never, notifications as never, config as never),
    prisma,
    notifications,
  };
}

describe('OnCallRoutingService.planAt', () => {
  it('rings the provider on call, then the default as fallback', async () => {
    answer();
    const { service } = build([person(A), person(C)]);
    const plan = await service.planAt(NOW);
    expect(plan.onCall).toEqual({ employeeId: A, name: 'Dr. Ann Doe', phone: '+12015550142' });
    expect(plan.fallback?.employeeId).toBe(C);
    expect(plan.backup).toBeNull();
    expect(plan.problems).toEqual([]);
  });

  it('skips a provider with no usable phone to the default, and says so', async () => {
    answer();
    const { service } = build([person(A, { phone: 'x12' }), person(C)]);
    const plan = await service.planAt(NOW);
    expect(plan.onCall?.employeeId).toBe(C);
    expect(plan.fallback).toBeNull();
    expect(plan.problems).toEqual(['Dr. Ann Doe has no phone number that can be dialled.']);
  });

  it('drops a backup who is the on-call person', async () => {
    answer({ backupEmployeeId: A });
    const { service } = build([person(A), person(C)]);
    expect((await service.planAt(NOW)).backup).toBeNull();
  });

  it('does not repeat the default as fallback when it is the backup', async () => {
    answer({ backupEmployeeId: C });
    const { service } = build([person(A), person(C)]);
    const plan = await service.planAt(NOW);
    expect(plan.backup?.employeeId).toBe(C);
    expect(plan.fallback).toBeNull();
  });

  it('will not dial a shared account or somebody who has left', async () => {
    answer({ backupEmployeeId: B });
    const { service } = build([
      person(A, { isSharedAccount: true }),
      person(B, { employmentStatus: EmploymentStatus.TERMINATED }),
      person(C),
    ]);
    const plan = await service.planAt(NOW);
    expect(plan.onCall?.employeeId).toBe(C);
    expect(plan.backup).toBeNull();
    expect(plan.problems).toHaveLength(2);
  });

  it('has nobody when not even the default can be dialled', async () => {
    answer({ employeeId: null, source: 'NONE' });
    const { service } = build([person(C, { phone: null })]);
    const plan = await service.planAt(NOW);
    expect(plan.onCall).toBeNull();
    expect(plan.problems).toHaveLength(1);
  });
});

describe('OnCallRoutingService covers', () => {
  const input = {
    startsAt: '2026-10-20T18:00',
    endsAt: '2026-10-21T08:00',
    employeeId: A,
  };

  it('refuses an end before the start, a long cover and a non-provider', async () => {
    const { service } = build([]);
    await expect(
      service.createCover({ ...input, endsAt: '2026-10-20T17:00' }, manager, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createCover({ ...input, endsAt: '2026-11-20T08:00' }, manager, NOW),
    ).rejects.toThrow('14 days');
    await expect(
      service.createCover({ ...input, employeeId: 'bad' }, manager, NOW),
    ).rejects.toThrow('Only providers');
    await expect(
      service.createCover({ ...input, backupEmployeeId: A }, manager, NOW),
    ).rejects.toThrow('backup');
    await expect(service.createCover(input, employee, NOW)).rejects.toThrow('managers');
  });

  it('refuses a cover already over', async () => {
    const { service } = build([]);
    await expect(
      service.createCover(
        { ...input, startsAt: '2026-10-01T18:00', endsAt: '2026-10-02T08:00' },
        manager,
        NOW,
      ),
    ).rejects.toThrow('future');
  });

  it('reads wall-clock times as New Jersey, across the clocks going back', async () => {
    const { service, prisma, notifications } = build([]);
    const made = await service.createCover(
      { ...input, startsAt: '2026-10-31T18:00', endsAt: '2026-11-01T08:00', backupEmployeeId: B },
      manager,
      NOW,
    );
    const data = prisma.onCallCover.create.mock.calls[0][0].data;
    expect(data.startsAt.toISOString()).toBe('2026-10-31T22:00:00.000Z'); // EDT
    expect(data.endsAt.toISOString()).toBe('2026-11-01T13:00:00.000Z'); // EST
    expect(made.startsLocal).toBe('2026-10-31T18:00');
    expect(made.endsLocal).toBe('2026-11-01T08:00');
    expect(notifications.onCall).toHaveBeenCalledWith([A, B], expect.anything(), { email: false });
  });
});

describe('OnCallRoutingService settings', () => {
  const messages = [{ key: 'OPENING_EN' as const, text: ' Hello ', audioUrl: null }];
  const ok = {
    defaultProviderId: null,
    voiceEn: 'Polly.Joanna-Neural',
    voiceEs: 'Polly.Lupe-Neural',
    ringSeconds: 20,
    messages,
  };

  it('saves a good set, trimmed', async () => {
    const { service, prisma } = build([]);
    await service.saveSettings(ok, manager);
    expect(prisma.callMessage.upsert.mock.calls[0][0].create.text).toBe('Hello');
    expect(prisma.callRoutingSettings.upsert).toHaveBeenCalled();
  });

  it('refuses a bad voice, bad ring time and bad links', async () => {
    const { service } = build([]);
    await expect(
      service.saveSettings({ ...ok, voiceEn: 'Polly.Lupe-Neural' }, manager),
    ).rejects.toThrow('English');
    await expect(service.saveSettings({ ...ok, voiceEs: 'nope' }, manager)).rejects.toThrow(
      'Spanish',
    );
    await expect(service.saveSettings({ ...ok, ringSeconds: 5 }, manager)).rejects.toThrow(
      '10 to 60',
    );
    await expect(service.saveSettings({ ...ok, ringSeconds: 61 }, manager)).rejects.toThrow(
      '10 to 60',
    );
    for (const audioUrl of ['http://x.com/a.mp3', 'not a url']) {
      await expect(
        service.saveSettings({ ...ok, messages: [{ ...messages[0], audioUrl }] }, manager),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.saveSettings({ ...ok, messages: [...messages, ...messages] }, manager),
    ).rejects.toThrow('once');
    await expect(
      service.saveSettings({ ...ok, messages: [{ ...messages[0], text: '  ' }] }, manager),
    ).rejects.toThrow('1 to 1500');
  });

  it('shows the line without ever carrying the token', async () => {
    const { service } = build(
      [person(A)],
      { defaultProviderId: null },
      {
        TWILIO_AUTH_TOKEN: 'secret-token',
        TWILIO_PHONE_NUMBER: '+12015550100',
        ONCALL_FALLBACK_PHONE: '(201) 555-0199',
      },
    );
    const view = await service.settings(manager);
    expect(view.line).toEqual({ switchedOn: true, number: '+12015550100', fallbackSet: true });
    expect(JSON.stringify(view)).not.toContain('secret-token');
    expect(view.messages).toHaveLength(8);
    expect(view.messages[0].text).toBe('');
    expect(view.providers[0].dialable).toBe(true);
  });
});
