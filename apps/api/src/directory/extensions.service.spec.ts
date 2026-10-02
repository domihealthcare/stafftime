import { Role } from '@prisma/client';
import { ExtensionsService } from './extensions.service';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };

function build(employeesFound = 0) {
  const prisma = {
    officeExtension: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockReturnValue('delete'),
      createMany: jest.fn().mockReturnValue('create'),
    },
    employee: { count: jest.fn().mockResolvedValue(employeesFound) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return { service: new ExtensionsService(prisma as never), prisma };
}

describe('ExtensionsService', () => {
  it('lists the lines in the order they were saved', async () => {
    const { service, prisma } = build();
    await service.list();
    expect(prisma.officeExtension.findMany.mock.calls[0][0].orderBy).toEqual({ sortOrder: 'asc' });
  });

  it('saves the whole list in the order given, tidied, replacing what was there', async () => {
    const { service, prisma } = build(1);
    await service.save(
      [
        {
          section: ' Admin Team ',
          label: 'Kayla Bermeo',
          extension: '121',
          homeExtension: '521',
          homeDays: ' Thursday ',
          employeeId: 'emp-kayla',
        },
        {
          section: 'Front Desk & Outdesk',
          label: 'NB Front Desk',
          extension: '101',
          homeExtension: '',
        },
      ],
      manager,
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(['delete', 'create']);
    expect(prisma.officeExtension.createMany).toHaveBeenCalledWith({
      data: [
        {
          section: 'Admin Team',
          label: 'Kayla Bermeo',
          extension: '121',
          homeExtension: '521',
          homeDays: 'Thursday',
          employeeId: 'emp-kayla',
          sortOrder: 10,
        },
        {
          section: 'Front Desk & Outdesk',
          label: 'NB Front Desk',
          extension: '101',
          homeExtension: null,
          homeDays: null,
          employeeId: null,
          sortOrder: 20,
        },
      ],
    });
  });

  it('refuses a line matched to somebody who does not exist', async () => {
    const { service, prisma } = build(0);
    await expect(
      service.save(
        [{ section: 'Admin Team', label: 'Nobody', extension: '199', employeeId: 'emp-gone' }],
        manager,
      ),
    ).rejects.toThrow('does not exist');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a line with only spaces for a name', async () => {
    const { service } = build();
    await expect(
      service.save([{ section: 'Misc', label: '   ', extension: '111' }], manager),
    ).rejects.toThrow('section and a name');
  });

  it('can empty the list', async () => {
    const { service, prisma } = build();
    await service.save([], manager);
    expect(prisma.officeExtension.createMany).toHaveBeenCalledWith({ data: [] });
  });
});
