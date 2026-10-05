import { heldJobRole } from './held-job-role';

describe('heldJobRole — somebody’s shift is for one of their own job roles', () => {
  const FRONT_DESK = { id: 'fd', name: 'Front Desk' };
  const MA = { id: 'ma', name: 'Medical Assistant' };
  const PROVIDER = { id: 'pr', name: 'Provider' };

  function prisma(held: { id: string; name: string }[]) {
    return {
      employeeJobRole: {
        findMany: jest.fn().mockResolvedValue(held.map((jobRole) => ({ jobRole }))),
      },
      jobRole: {
        findUnique: jest
          .fn()
          .mockImplementation(
            ({ where }) => [FRONT_DESK, MA, PROVIDER].find((role) => role.id === where.id) ?? null,
          ),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it('uses a role they hold, as asked', async () => {
    await expect(heldJobRole(prisma([FRONT_DESK, MA]), 'emp', 'ma')).resolves.toBe('ma');
  });

  it('refuses a role they do not hold, by name, and lists theirs', async () => {
    await expect(heldJobRole(prisma([FRONT_DESK, MA]), 'emp', 'pr')).rejects.toThrow(
      'They are not in Provider. Choose one of theirs (Front Desk or Medical Assistant), or add them to Provider on Staff first.',
    );
  });

  it('refuses a role that does not exist', async () => {
    await expect(heldJobRole(prisma([FRONT_DESK]), 'emp', 'gone')).rejects.toThrow(
      'That job role does not exist.',
    );
  });

  it('with none asked for, uses their only role', async () => {
    await expect(heldJobRole(prisma([FRONT_DESK]), 'emp', null)).resolves.toBe('fd');
    await expect(heldJobRole(prisma([FRONT_DESK]), 'emp', undefined)).resolves.toBe('fd');
  });

  it('with none asked for and several held, uses their main one — never "any"', async () => {
    const db = prisma([FRONT_DESK, MA]);
    await expect(heldJobRole(db, 'emp', null)).resolves.toBe('fd');
    // Main first, then the practice's order: the database puts it at the top.
    expect(db.employeeJobRole.findMany.mock.calls[0][0].orderBy).toEqual([
      { isPrimary: 'desc' },
      { jobRole: { sortOrder: 'asc' } },
    ]);
  });

  it('somebody with no job role yet gets a shift with none', async () => {
    await expect(heldJobRole(prisma([]), 'emp', null)).resolves.toBeNull();
    await expect(heldJobRole(prisma([]), 'emp', 'fd')).rejects.toThrow(
      'They are not in Front Desk, and have no job role yet.',
    );
  });
});
