import { CredentialReminderStage, Prisma } from '@prisma/client';
import { LicenseRemindersService } from '../maintenance/license-reminders.service';
import { dueReminders, ReminderCredential, reminderWording, stageFor } from './license-reminders';

const TODAY = '2026-10-09';

function card(overrides: Partial<ReminderCredential> = {}): ReminderCredential {
  return {
    id: 'cred-1',
    employeeId: 'emp-1',
    name: 'DEA registration',
    credentialTypeId: 'type-dea',
    typeName: 'DEA registration',
    expiresOn: '2026-11-08',
    ...overrides,
  };
}

describe('when somebody is reminded about their own license', () => {
  it('at 60 days, at 30 days, and for 30 days after it lapses — nothing before or after', () => {
    expect(stageFor(61)).toBeNull();
    expect(stageFor(60)).toBe(CredentialReminderStage.DAYS_60);
    expect(stageFor(31)).toBe(CredentialReminderStage.DAYS_60);
    expect(stageFor(30)).toBe(CredentialReminderStage.DAYS_30);
    expect(stageFor(0)).toBe(CredentialReminderStage.DAYS_30);
    expect(stageFor(-1)).toBe(CredentialReminderStage.LAPSED);
    expect(stageFor(-30)).toBe(CredentialReminderStage.LAPSED);
    expect(stageFor(-31)).toBeNull();
  });

  it('only the most pressing stage that applies: 10 days out is the 30-day reminder', () => {
    const due = dueReminders([card({ expiresOn: '2026-10-19' })], TODAY);
    expect(due).toEqual([
      expect.objectContaining({ stage: CredentialReminderStage.DAYS_30, daysLeft: 10 }),
    ]);
  });

  it('says nothing about an old card once its renewal is on file', () => {
    const due = dueReminders(
      [card({ id: 'old', expiresOn: '2026-10-19' }), card({ id: 'new', expiresOn: '2029-10-31' })],
      TODAY,
    );
    expect(due).toEqual([]);
  });

  it('counts a renewal typed in by hand under the same name as the same license', () => {
    const due = dueReminders(
      [
        card({ id: 'old', expiresOn: '2026-10-19' }),
        card({
          id: 'new',
          credentialTypeId: null,
          typeName: null,
          name: 'dea registration ',
          expiresOn: '2029-10-31',
        }),
      ],
      TODAY,
    );
    expect(due).toEqual([]);
  });

  it('keeps separate people and separate licenses apart', () => {
    const due = dueReminders(
      [
        card({ id: 'a', expiresOn: '2026-10-19' }),
        card({ id: 'b', employeeId: 'emp-2', expiresOn: '2029-10-31' }),
        card({
          id: 'c',
          credentialTypeId: 'type-bls',
          typeName: 'BLS',
          name: 'BLS',
          expiresOn: '2029-10-31',
        }),
      ],
      TODAY,
    );
    expect(due.map((reminder) => reminder.credential.id)).toEqual(['a']);
  });

  it('words each one plainly, and says what to do once renewed', () => {
    expect(
      reminderWording('DEA registration', CredentialReminderStage.DAYS_30, 10, '2026-10-19'),
    ).toEqual({
      title: 'Your DEA registration expires in 10 days',
      body: 'It runs out on Mon, Oct 19, 2026. Once it is renewed, give a manager the new expiry date so it is updated here.',
    });
    expect(reminderWording('BLS', CredentialReminderStage.DAYS_30, 1, '2026-10-10').title).toBe(
      'Your BLS expires in 1 day',
    );
    expect(reminderWording('BLS', CredentialReminderStage.DAYS_30, 0, '2026-10-09').title).toBe(
      'Your BLS expires today',
    );
    expect(reminderWording('BLS', CredentialReminderStage.LAPSED, -3, '2026-10-06').title).toBe(
      'Your BLS has expired',
    );
  });
});

describe('sending them', () => {
  function build(alreadySent = false) {
    const prisma = {
      employeeCredential: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cred-1',
            employeeId: 'emp-1',
            name: 'DEA registration',
            credentialTypeId: 'type-dea',
            expiresOn: new Date('2026-10-19T00:00:00Z'),
            credentialType: { name: 'DEA registration' },
          },
        ]),
      },
      credentialReminder: {
        create: alreadySent
          ? jest
              .fn()
              .mockRejectedValue(
                new Prisma.PrismaClientKnownRequestError('unique', {
                  code: 'P2002',
                  clientVersion: 'x',
                }),
              )
          : jest.fn().mockResolvedValue({}),
      },
    };
    const notifications = { licenseReminder: jest.fn().mockResolvedValue(undefined) };
    const service = new LicenseRemindersService(prisma as never, notifications as never);
    return { service, prisma, notifications };
  }

  it('records the reminder, then tells the person', async () => {
    const { service, prisma, notifications } = build();
    await expect(service.send(new Date('2026-10-09T14:00:00Z'))).resolves.toBe(1);
    expect(prisma.credentialReminder.create).toHaveBeenCalledWith({
      data: {
        credentialId: 'cred-1',
        stage: CredentialReminderStage.DAYS_30,
        expiresOn: new Date('2026-10-19T00:00:00Z'),
      },
    });
    expect(notifications.licenseReminder).toHaveBeenCalledWith('emp-1', {
      title: 'Your DEA registration expires in 10 days',
      body: expect.stringContaining('Mon, Oct 19, 2026'),
    });
  });

  it('says nothing the second time for the same date', async () => {
    const { service, notifications } = build(true);
    await expect(service.send(new Date('2026-10-09T14:00:00Z'))).resolves.toBe(0);
    expect(notifications.licenseReminder).not.toHaveBeenCalled();
  });
});
