import { NotFoundException } from '@nestjs/common';
import { PracticeEventKind, Role, StudentKind } from '@prisma/client';
import { describeStudent, providerName } from './students';
import { StudentsService } from './students.service';

const manager = { id: 'mgr-1', email: 'manager@domihealthcare.com', role: Role.MANAGER };

function build(found: unknown = { id: 'stu-1' }) {
  const prisma = {
    student: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(found),
      create: jest.fn(async ({ data }) => ({ id: 'stu-1', ...data })),
      update: jest.fn(async ({ data }) => ({ id: 'stu-1', ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    practiceEvent: {
      groupBy: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'e1', firstName: 'Jose', lastName: 'Badia', preferredName: null, postNominals: 'MD' },
        {
          id: 'e2',
          firstName: 'Casey',
          lastName: 'Rivera',
          preferredName: 'Cass',
          postNominals: 'APN',
        },
      ]),
    },
    $transaction: jest.fn(async (calls: Promise<unknown>[]) => Promise.all(calls)),
  };
  return { prisma, service: new StudentsService(prisma as never) };
}

describe('StudentsService', () => {
  it('keeps a name, what they are and a school, trimmed, a blank school as nothing', async () => {
    const { service, prisma } = build();
    await service.create(
      { name: '  Jane Student ', kind: StudentKind.RESIDENT, school: '  ' },
      manager,
    );
    expect(prisma.student.create).toHaveBeenCalledWith({
      data: { name: 'Jane Student', kind: StudentKind.RESIDENT, school: null },
    });
  });

  it('renames their rotation dates with them', async () => {
    const { service, prisma } = build();
    await service.update(
      'stu-1',
      { name: 'Jane Smith', kind: StudentKind.MEDICAL_STUDENT, school: 'Rutgers' },
      manager,
    );
    expect(prisma.practiceEvent.updateMany).toHaveBeenCalledWith({
      where: { studentId: 'stu-1', kind: PracticeEventKind.ROTATION },
      data: { title: 'Jane Smith' },
    });
  });

  it('says so when the student has gone', async () => {
    const { service } = build(null);
    await expect(service.remove('stu-9', manager)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists the providers to choose from, a doctor as "Dr."', async () => {
    const { service } = build();
    expect(await service.providers()).toEqual([
      { id: 'e1', name: 'Dr. Jose Badia' },
      { id: 'e2', name: 'Cass Rivera' },
    ]);
  });

  it('describes a student plainly', () => {
    expect(describeStudent({ kind: StudentKind.NP_STUDENT, school: 'Rutgers' })).toBe(
      'NP student, Rutgers',
    );
    expect(describeStudent({ kind: StudentKind.RESIDENT, school: null })).toBe('Resident');
    expect(
      providerName({ firstName: 'A', lastName: 'B', preferredName: null, postNominals: 'DO' }),
    ).toBe('Dr. A B');
  });
});
