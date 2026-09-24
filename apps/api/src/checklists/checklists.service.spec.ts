import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ChecklistKind,
  ChecklistTaskStatus,
  Role,
  TaskOwner,
} from '@prisma/client';
import { ChecklistsService } from './checklists.service';

const admin = { id: 'adm-1', email: 'admin@domihealthcare.com', role: Role.ADMIN };
const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };
const employee = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };
const otherEmployee = { id: 'emp-2', email: 'mo@domihealthcare.com', role: Role.EMPLOYEE };

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const TEMPLATE = {
  id: 'tpl-1',
  kind: ChecklistKind.ONBOARDING,
  name: 'New hire — Domi Healthcare',
  archivedAt: null,
  tasks: [
    {
      position: 0,
      title: 'Form I-9 completed and verified',
      description: 'Section 2 within three business days.',
      owner: TaskOwner.ADMIN,
      dueOffsetDays: 3,
    },
    {
      position: 1,
      title: 'Employee handbook acknowledged',
      description: null,
      owner: TaskOwner.EMPLOYEE,
      dueOffsetDays: 5,
    },
    {
      position: 2,
      title: 'Introduced to the team',
      description: null,
      owner: TaskOwner.MANAGER,
      dueOffsetDays: null,
    },
  ],
};

function build(
  options: {
    employee?: unknown;
    template?: unknown;
    openChecklist?: unknown;
    task?: unknown;
    pendingCount?: number;
    completedAt?: Date | null;
    checklist?: unknown;
  } = {},
) {
  const created: Record<string, unknown>[] = [];

  const prisma = {
    employee: {
      findUnique: jest.fn().mockResolvedValue(
        options.employee === undefined
          ? {
              id: 'emp-1',
              firstName: 'Frankie',
              lastName: 'Front-Desk',
              hireDate: day('2026-10-05'),
              terminationDate: null,
            }
          : options.employee,
      ),
    },
    checklistTemplate: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.template === undefined ? TEMPLATE : options.template),
      findFirst: jest
        .fn()
        .mockResolvedValue(options.template === undefined ? TEMPLATE : options.template),
    },
    employeeChecklist: {
      findFirst: jest.fn().mockResolvedValue(options.openChecklist ?? null),
      create: jest.fn(async ({ data }) => {
        created.push(data);
        return {
          id: 'chk-1',
          ...data,
          employee: { id: 'emp-1', firstName: 'Frankie', lastName: 'Front-Desk' },
          tasks: data.tasks.create.map((task: Record<string, unknown>, index: number) => ({
            id: `task-${index}`,
            status: ChecklistTaskStatus.PENDING,
            ...task,
          })),
        };
      }),
      findUnique: jest.fn().mockResolvedValue(
        options.checklist === undefined
          ? {
              id: 'chk-1',
              employeeId: 'emp-1',
              kind: ChecklistKind.ONBOARDING,
              completedAt: options.completedAt ?? null,
              tasks: [],
            }
          : options.checklist,
      ),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }) => ({ id: 'chk-1', ...data })),
      delete: jest.fn(async () => ({ id: 'chk-1' })),
    },
    employeeChecklistTask: {
      findUnique: jest.fn().mockResolvedValue(
        options.task === undefined
          ? {
              id: 'task-0',
              checklistId: 'chk-1',
              owner: TaskOwner.ADMIN,
              checklist: { id: 'chk-1', employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING },
            }
          : options.task,
      ),
      update: jest.fn(async ({ data }) => ({ id: 'task-0', ...data })),
      count: jest.fn().mockResolvedValue(options.pendingCount ?? 1),
    },
  };

  return {
    service: new ChecklistsService(
      prisma as never,
      { notify: jest.fn(), notifyEveryone: jest.fn().mockResolvedValue(undefined) } as never,
    ),
    prisma,
    created,
  };
}

describe('ChecklistsService — starting one', () => {
  it('copies the template tasks rather than pointing at them', async () => {
    const { service, created } = build();
    await service.start({ employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING }, admin);

    const tasks = (created[0].tasks as { create: Record<string, unknown>[] }).create;
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      position: 0,
      title: 'Form I-9 completed and verified',
    });
    // The name is copied too, so a renamed template does not rename history.
    expect(created[0].name).toBe('New hire — Domi Healthcare');
    expect(created[0].templateId).toBe('tpl-1');
  });

  it('hangs due dates off the hire date', async () => {
    const { service, created } = build();
    await service.start({ employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING }, admin);

    const tasks = (created[0].tasks as { create: { dueAt: Date | null }[] }).create;
    expect(tasks[0].dueAt).toEqual(day('2026-10-08')); // hire date + 3
    expect(tasks[1].dueAt).toEqual(day('2026-10-10')); // + 5
    expect(tasks[2].dueAt).toBeNull(); // no offset means no due date
  });

  it('handles an offset that reaches back before the anchor', async () => {
    const { service, created } = build({
      template: {
        ...TEMPLATE,
        tasks: [{ ...TEMPLATE.tasks[0], dueOffsetDays: -7 }],
      },
    });
    await service.start({ employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING }, admin);

    const tasks = (created[0].tasks as { create: { dueAt: Date }[] }).create;
    expect(tasks[0].dueAt).toEqual(day('2026-09-28'));
  });

  it('does not drift across a clock change', async () => {
    // US clocks go back on 2026-11-01. A due date 5 days after 2026-10-30 is
    // the 4th of November, not the 3rd at 11pm.
    const { service, created } = build({
      employee: {
        id: 'emp-1',
        firstName: 'Frankie',
        hireDate: day('2026-10-30'),
        terminationDate: null,
      },
      template: { ...TEMPLATE, tasks: [{ ...TEMPLATE.tasks[0], dueOffsetDays: 5 }] },
    });
    await service.start({ employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING }, admin);

    const tasks = (created[0].tasks as { create: { dueAt: Date }[] }).create;
    expect(tasks[0].dueAt.toISOString()).toBe('2026-11-04T00:00:00.000Z');
  });

  it('uses an explicit anchor date when given one', async () => {
    const { service, created } = build();
    await service.start(
      { employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING, anchorDate: '2027-01-11' },
      admin,
    );

    expect(created[0].anchorDate).toEqual(day('2027-01-11'));
  });

  it('anchors an offboarding checklist to the last day', async () => {
    const { service, created } = build({
      employee: {
        id: 'emp-1',
        firstName: 'Frankie',
        hireDate: day('2024-01-02'),
        terminationDate: day('2026-12-31'),
      },
      template: { ...TEMPLATE, kind: ChecklistKind.OFFBOARDING },
    });
    await service.start({ employeeId: 'emp-1', kind: ChecklistKind.OFFBOARDING }, admin);

    expect(created[0].anchorDate).toEqual(day('2026-12-31'));
  });

  it('asks for a last day rather than guessing one', async () => {
    const { service } = build({
      template: { ...TEMPLATE, kind: ChecklistKind.OFFBOARDING },
    });
    await expect(
      service.start({ employeeId: 'emp-1', kind: ChecklistKind.OFFBOARDING }, admin),
    ).rejects.toThrow(/last day/);
  });

  it('refuses a second unfinished checklist of the same kind', async () => {
    const { service } = build({ openChecklist: { id: 'chk-0' } });
    await expect(
      service.start({ employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING }, admin),
    ).rejects.toThrow(/already has an unfinished/);
  });

  it('refuses a template of the wrong kind', async () => {
    const { service } = build({
      template: { ...TEMPLATE, kind: ChecklistKind.OFFBOARDING },
    });
    await expect(
      service.start(
        { employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING, templateId: 'tpl-1' },
        admin,
      ),
    ).rejects.toThrow(/is for offboarding, not onboarding/);
  });

  it('says what to do when there is no default template', async () => {
    const { service } = build({ template: null });
    await expect(
      service.start({ employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING }, admin),
    ).rejects.toThrow(/no default onboarding template/);
  });

  it('refuses an empty template', async () => {
    const { service } = build({ template: { ...TEMPLATE, tasks: [] } });
    await expect(
      service.start({ employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING }, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an employee who does not exist', async () => {
    const { service } = build({ employee: null });
    await expect(
      service.start({ employeeId: 'nope', kind: ChecklistKind.ONBOARDING }, admin),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ChecklistsService — ticking things off', () => {
  it('ticks a task off, recording who did it and when', async () => {
    const { service, prisma } = build({
      task: {
        id: 'task-0',
        checklistId: 'chk-1',
        owner: TaskOwner.ADMIN,
        checklist: { id: 'chk-1', employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING },
      },
    });

    await service.updateTask('task-0', { status: ChecklistTaskStatus.DONE }, admin);
    expect(prisma.employeeChecklistTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ChecklistTaskStatus.DONE,
          completedById: 'adm-1',
        }),
      }),
    );
  });

  it('insists on a reason for marking something not applicable', async () => {
    const { service } = build();
    await expect(
      service.updateTask('task-0', { status: ChecklistTaskStatus.NOT_APPLICABLE }, admin),
    ).rejects.toThrow(/why it does not apply/);

    await expect(
      service.updateTask(
        'task-0',
        { status: ChecklistTaskStatus.NOT_APPLICABLE, note: '   ' },
        admin,
      ),
    ).rejects.toThrow(/why it does not apply/);
  });

  it('accepts a reason and keeps it', async () => {
    const { service, prisma } = build();
    await service.updateTask(
      'task-0',
      { status: ChecklistTaskStatus.NOT_APPLICABLE, note: 'Non-clinical role' },
      admin,
    );

    expect(prisma.employeeChecklistTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: 'Non-clinical role' }),
      }),
    );
  });

  it('clears the completion record when a task is reopened', async () => {
    const { service, prisma } = build();
    await service.updateTask('task-0', { status: ChecklistTaskStatus.PENDING }, admin);

    expect(prisma.employeeChecklistTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedById: null, completedAt: null }),
      }),
    );
  });

  it('marks the checklist finished when nothing is left pending', async () => {
    const { service, prisma } = build({ pendingCount: 0, completedAt: null });
    await service.updateTask('task-0', { status: ChecklistTaskStatus.DONE }, admin);

    expect(prisma.employeeChecklist.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedAt: expect.any(Date) }),
      }),
    );
  });

  it('un-finishes it when a task is reopened', async () => {
    const { service, prisma } = build({
      pendingCount: 1,
      completedAt: new Date('2026-10-20T10:00:00.000Z'),
    });
    await service.updateTask('task-0', { status: ChecklistTaskStatus.PENDING }, admin);

    expect(prisma.employeeChecklist.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { completedAt: null } }),
    );
  });

  it('does not keep re-stamping a checklist that is already finished', async () => {
    const { service, prisma } = build({
      pendingCount: 0,
      completedAt: new Date('2026-10-20T10:00:00.000Z'),
    });
    await service.updateTask('task-0', { status: ChecklistTaskStatus.DONE }, admin);

    expect(prisma.employeeChecklist.update).not.toHaveBeenCalled();
  });
});

describe('ChecklistsService — who may do what', () => {
  const ownEmployeeTask = {
    id: 'task-1',
    checklistId: 'chk-1',
    owner: TaskOwner.EMPLOYEE,
    checklist: { id: 'chk-1', employeeId: 'emp-1', kind: ChecklistKind.ONBOARDING },
  };

  it('lets an employee tick off their own task', async () => {
    const { service, prisma } = build({ task: ownEmployeeTask });
    await service.updateTask('task-1', { status: ChecklistTaskStatus.DONE }, employee);

    expect(prisma.employeeChecklistTask.update).toHaveBeenCalled();
  });

  it("will not let an employee tick off a manager's task", async () => {
    const { service } = build();
    await expect(
      service.updateTask('task-0', { status: ChecklistTaskStatus.DONE }, employee),
    ).rejects.toThrow(ForbiddenException);
  });

  it("will not let an employee touch somebody else's checklist", async () => {
    const { service } = build({ task: ownEmployeeTask });
    await expect(
      service.updateTask('task-1', { status: ChecklistTaskStatus.DONE }, otherEmployee),
    ).rejects.toThrow(/not yours/);
  });

  it('lets a manager run the checklist', async () => {
    const { service, prisma } = build();
    await service.updateTask('task-0', { status: ChecklistTaskStatus.DONE }, manager);

    expect(prisma.employeeChecklistTask.update).toHaveBeenCalled();
  });

  it('shows an employee only their own, whatever they ask for', async () => {
    const { service, prisma } = build();
    await service.findAll({ employeeId: 'emp-2' }, employee);

    expect(prisma.employeeChecklist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ employeeId: 'emp-1' }),
      }),
    );
  });

  it("refuses to show an employee somebody else's checklist by id", async () => {
    const { service } = build({
      checklist: {
        id: 'chk-1',
        employeeId: 'emp-2',
        kind: ChecklistKind.ONBOARDING,
        completedAt: null,
        tasks: [],
      },
    });

    await expect(service.findOne('chk-1', employee)).rejects.toThrow(ForbiddenException);
  });

  it('hides finished checklists by default', async () => {
    const { service, prisma } = build();
    await service.findAll({}, manager);

    expect(prisma.employeeChecklist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ completedAt: null }) }),
    );
  });
});

describe('ChecklistsService — deleting one', () => {
  it('deletes the checklist', async () => {
    const { service, prisma } = build({ checklist: { id: 'chk-1' } });

    await expect(service.remove('chk-1')).resolves.toEqual({ deleted: true });
    expect(prisma.employeeChecklist.delete).toHaveBeenCalledWith({ where: { id: 'chk-1' } });
  });

  it('refuses a checklist that does not exist', async () => {
    const { service } = build({ checklist: null });
    await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('ChecklistsService — what the screens get told', () => {
  function checklistWith(tasks: Record<string, unknown>[]) {
    return {
      id: 'chk-1',
      employeeId: 'emp-1',
      kind: ChecklistKind.ONBOARDING,
      completedAt: null,
      tasks,
    };
  }

  it('counts progress and names what is holding it up', async () => {
    const { service } = build({
      checklist: checklistWith([
        { title: 'I-9', status: ChecklistTaskStatus.DONE, dueAt: null },
        { title: 'Handbook', status: ChecklistTaskStatus.PENDING, dueAt: null },
        { title: 'BLS card', status: ChecklistTaskStatus.NOT_APPLICABLE, dueAt: null },
        { title: 'Keys', status: ChecklistTaskStatus.PENDING, dueAt: null },
      ]),
    });

    const result = await service.findOne('chk-1', manager);
    expect(result.progress).toEqual({ total: 4, settled: 2, pending: 2, percent: 50 });
    expect(result.nextTask).toBe('Handbook');
  });

  it('counts a pending task past its due date as overdue, and a done one as not', async () => {
    const { service } = build({
      checklist: checklistWith([
        { title: 'Late', status: ChecklistTaskStatus.PENDING, dueAt: day('2020-01-01') },
        { title: 'Also late', status: ChecklistTaskStatus.PENDING, dueAt: day('2020-01-02') },
        { title: 'Done late', status: ChecklistTaskStatus.DONE, dueAt: day('2020-01-01') },
        { title: 'Future', status: ChecklistTaskStatus.PENDING, dueAt: day('2099-01-01') },
        { title: 'No date', status: ChecklistTaskStatus.PENDING, dueAt: null },
      ]),
    });

    const result = await service.findOne('chk-1', manager);
    expect(result.overdueCount).toBe(2);
  });

  it('does not call something due today overdue', async () => {
    const today = new Date();
    const todayUtc = new Date(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const { service } = build({
      checklist: checklistWith([
        { title: 'Today', status: ChecklistTaskStatus.PENDING, dueAt: todayUtc },
      ]),
    });

    const result = await service.findOne('chk-1', manager);
    expect(result.overdueCount).toBe(0);
  });

  it('reports an empty checklist as 0%, not as a division by zero', async () => {
    const { service } = build({ checklist: checklistWith([]) });
    const result = await service.findOne('chk-1', manager);

    expect(result.progress).toEqual({ total: 0, settled: 0, pending: 0, percent: 0 });
    expect(result.nextTask).toBeNull();
  });
});
