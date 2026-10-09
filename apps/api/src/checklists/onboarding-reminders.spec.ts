import { ChecklistReminderStage, Prisma } from '@prisma/client';
import { OnboardingRemindersService } from '../maintenance/onboarding-reminders.service';
import {
  dueTaskReminders,
  ReminderTask,
  taskReminderWording,
  taskStageFor,
} from './onboarding-reminders';

const TODAY = '2026-10-09';

function task(overrides: Partial<ReminderTask> = {}): ReminderTask {
  return {
    id: 'task-1',
    employeeId: 'emp-1',
    title: 'Employee handbook read and acknowledged',
    dueOn: '2026-10-10',
    checklistStartedOn: '2026-10-05',
    ...overrides,
  };
}

describe('when a new hire is reminded about their own onboarding tasks', () => {
  it('from two days before the due date, and for two weeks after it — nothing else', () => {
    expect(taskStageFor(3)).toBeNull();
    expect(taskStageFor(2)).toBe(ChecklistReminderStage.DUE_SOON);
    expect(taskStageFor(0)).toBe(ChecklistReminderStage.DUE_SOON);
    expect(taskStageFor(-1)).toBe(ChecklistReminderStage.OVERDUE);
    expect(taskStageFor(-14)).toBe(ChecklistReminderStage.OVERDUE);
    expect(taskStageFor(-15)).toBeNull();
  });

  it('says nothing on the day the checklist starts — that notice has just gone', () => {
    expect(dueTaskReminders([task({ checklistStartedOn: TODAY })], TODAY)).toEqual([]);
    expect(dueTaskReminders([task()], TODAY)).toEqual([
      expect.objectContaining({ stage: ChecklistReminderStage.DUE_SOON, daysLeft: 1 }),
    ]);
  });

  it('words one task by its name and when it is due', () => {
    expect(
      taskReminderWording([{ task: task(), stage: ChecklistReminderStage.DUE_SOON, daysLeft: 1 }]),
    ).toEqual({
      title: 'Onboarding: “Employee handbook read and acknowledged” is due tomorrow',
      body: 'It is yours to do, by Sat, Oct 10. Tick it off on your onboarding checklist once it is done.',
    });
    expect(
      taskReminderWording([
        {
          task: task({ dueOn: '2026-10-06' }),
          stage: ChecklistReminderStage.OVERDUE,
          daysLeft: -3,
        },
      ]).title,
    ).toBe('Onboarding: “Employee handbook read and acknowledged” was due Tue, Oct 6');
  });

  it('puts several into one message, overdue first', () => {
    const words = taskReminderWording([
      { task: task(), stage: ChecklistReminderStage.DUE_SOON, daysLeft: 1 },
      {
        task: task({ id: 'task-2', title: 'Emergency contact recorded', dueOn: '2026-10-06' }),
        stage: ChecklistReminderStage.OVERDUE,
        daysLeft: -3,
      },
    ]);
    expect(words.title).toBe('2 of your onboarding tasks need doing');
    expect(words.body).toBe(
      '“Emergency contact recorded” — was due Tue, Oct 6; “Employee handbook read and acknowledged” — due tomorrow. Tick each off on your onboarding checklist once it is done, or tell a manager if something is in the way.',
    );
  });
});

describe('sending them', () => {
  function build(alreadySent: string[] = []) {
    const row = (id: string, title: string, dueAt: string) => ({
      id,
      title,
      dueAt: new Date(`${dueAt}T00:00:00Z`),
      checklist: { employeeId: 'emp-1', createdAt: new Date('2026-10-05T14:00:00Z') },
    });
    const prisma = {
      employeeChecklistTask: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            row('task-1', 'Employee handbook read and acknowledged', '2026-10-10'),
            row('task-2', 'Emergency contact recorded', '2026-10-06'),
          ]),
      },
      checklistTaskReminder: {
        create: jest.fn().mockImplementation(({ data }) =>
          alreadySent.includes(data.taskId)
            ? Promise.reject(
                new Prisma.PrismaClientKnownRequestError('unique', {
                  code: 'P2002',
                  clientVersion: 'x',
                }),
              )
            : Promise.resolve({}),
        ),
      },
    };
    const notifications = { onboardingReminder: jest.fn().mockResolvedValue(undefined) };
    const service = new OnboardingRemindersService(prisma as never, notifications as never);
    return { service, prisma, notifications };
  }

  it('records each, then tells the person once about all of them', async () => {
    const { service, prisma, notifications } = build();
    await expect(service.send(new Date('2026-10-09T14:00:00Z'))).resolves.toBe(1);
    expect(prisma.checklistTaskReminder.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-2',
        stage: ChecklistReminderStage.OVERDUE,
        dueAt: new Date('2026-10-06T00:00:00Z'),
      },
    });
    expect(notifications.onboardingReminder).toHaveBeenCalledTimes(1);
    expect(notifications.onboardingReminder).toHaveBeenCalledWith('emp-1', {
      title: '2 of your onboarding tasks need doing',
      body: expect.stringContaining('Emergency contact recorded'),
    });
  });

  it('leaves out what was already said, and says nothing when that is everything', async () => {
    const some = build(['task-2']);
    await some.service.send(new Date('2026-10-09T14:00:00Z'));
    expect(some.notifications.onboardingReminder).toHaveBeenCalledWith('emp-1', {
      title: 'Onboarding: “Employee handbook read and acknowledged” is due tomorrow',
      body: expect.any(String),
    });

    const all = build(['task-1', 'task-2']);
    await expect(all.service.send(new Date('2026-10-09T14:00:00Z'))).resolves.toBe(0);
    expect(all.notifications.onboardingReminder).not.toHaveBeenCalled();
  });

  it('asks only for tasks theirs to do, still to do, on an open onboarding checklist', async () => {
    const { service, prisma } = build();
    await service.send(new Date('2026-10-09T14:00:00Z'));
    expect(prisma.employeeChecklistTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          owner: 'EMPLOYEE',
          status: 'PENDING',
          checklist: expect.objectContaining({ kind: 'ONBOARDING', completedAt: null }),
        }),
      }),
    );
  });
});
