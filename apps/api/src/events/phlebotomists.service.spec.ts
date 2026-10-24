import { Prisma } from '@prisma/client';
import { PhlebotomistsService } from './phlebotomists.service';

function build(known = 0) {
  const prisma = {
    phlebotomist: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(known),
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ id: 'p1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  return { prisma, service: new PhlebotomistsService(prisma as never) };
}

describe('PhlebotomistsService', () => {
  it('keeps a new name, tidied', async () => {
    const { service, prisma } = build();
    await service.remember('  Maria   Lopez ');
    expect(prisma.phlebotomist.count).toHaveBeenCalledWith({
      where: { name: { equals: 'Maria Lopez', mode: 'insensitive' } },
    });
    expect(prisma.phlebotomist.create).toHaveBeenCalledWith({ data: { name: 'Maria Lopez' } });
  });

  it('keeps a name once, however it is capitalised', async () => {
    const { service, prisma } = build(1);
    await service.remember('maria lopez');
    expect(prisma.phlebotomist.create).not.toHaveBeenCalled();
  });

  it('does not keep the plain "Phlebotomist" or a blank', async () => {
    const { service, prisma } = build();
    await service.remember('Phlebotomist');
    await service.remember(' ');
    expect(prisma.phlebotomist.count).not.toHaveBeenCalled();
  });

  it('is fine when two saves keep the same name at once', async () => {
    const { service, prisma } = build();
    prisma.phlebotomist.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.remember('Maria')).resolves.toBeUndefined();
  });

  it('removes a name, and says so when it has already gone', async () => {
    const { service, prisma } = build();
    await expect(service.remove('p1', { id: 'm1' } as never)).resolves.toEqual({ removed: true });
    prisma.phlebotomist.findUnique.mockResolvedValueOnce(null);
    await expect(service.remove('p2', { id: 'm1' } as never)).rejects.toThrow(
      'That name is no longer on the list.',
    );
  });
});
