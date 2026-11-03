import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { deflateSync } from 'node:zlib';
import { PayLockGuard } from '../pay-lock/pay-lock.guard';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';

const person = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: 'Lee',
  preferredName: null,
  postNominals: null,
  photoUpdatedAt: null,
});

function png(): string {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(300, 0);
  header.writeUInt32BE(100, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(10))),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

function build(options: { providerRole?: boolean; canStamp?: boolean; ownerFound?: boolean } = {}) {
  const prisma = {
    jobRole: { count: jest.fn().mockResolvedValue(options.providerRole ? 1 : 0) },
    employee: {
      findUnique: jest.fn().mockResolvedValue({
        canStampSignatures: options.canStamp ?? false,
        isSharedAccount: false,
        employmentStatus: 'ACTIVE',
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(person('me', 'Jo')),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.ownerFound === false
            ? null
            : { id: 'dr', savedSignature: { bytes: Buffer.from('ink') } },
        ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    savedSignature: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ updatedAt: new Date() }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    signatureUse: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const jobRoles = { idsHeldBy: jest.fn().mockResolvedValue(['role']) };
  return { service: new SignaturesService(prisma as never, jobRoles as never), prisma };
}

const frankie = { id: 'fd', email: 'f@x.com', role: Role.EMPLOYEE };

describe('SignaturesService', () => {
  it('lets a chosen member of staff stamp a provider’s, and logs it', async () => {
    const { service, prisma } = build({ canStamp: true });
    const result = await service.stamp(frankie, 'dr');
    expect(result.image).toBe(`data:image/png;base64,${Buffer.from('ink').toString('base64')}`);
    expect(prisma.signatureUse.create).toHaveBeenCalledWith({
      data: { ownerId: 'dr', usedById: 'fd' },
    });
  });

  it('refuses somebody not chosen, and logs nothing', async () => {
    const { service, prisma } = build();
    await expect(service.stamp(frankie, 'dr')).rejects.toThrow(ForbiddenException);
    expect(prisma.signatureUse.create).not.toHaveBeenCalled();
  });

  it('refuses while an admin views as somebody, even when the admin is chosen', async () => {
    const { service } = build({ canStamp: true });
    await expect(
      service.stamp(
        { id: 'ad', email: 'a@x.com', role: Role.EMPLOYEE, actualRole: Role.ADMIN },
        'dr',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses the signature of somebody who is no longer a provider', async () => {
    const { service } = build({ canStamp: true, ownerFound: false });
    await expect(service.stamp(frankie, 'dr')).rejects.toThrow(/not a current provider/);
  });

  it('says so when the provider has not saved one', async () => {
    const { service, prisma } = build({ canStamp: true });
    prisma.employee.findFirst.mockResolvedValue({ id: 'dr', savedSignature: null });
    await expect(service.stamp(frankie, 'dr')).rejects.toThrow(BadRequestException);
  });

  it('saves a signature for a provider only', async () => {
    const provider = build({ providerRole: true });
    await provider.service.save({ id: 'dr', email: 'd@x.com', role: Role.EMPLOYEE }, png());
    expect(provider.prisma.savedSignature.upsert).toHaveBeenCalled();

    const staff = build();
    await expect(staff.service.save(frankie, png())).rejects.toThrow(ForbiddenException);
  });

  it('refuses a picture that is not a signature PNG', async () => {
    const { service } = build({ providerRole: true });
    await expect(
      service.save({ id: 'dr', email: 'd@x.com', role: Role.EMPLOYEE }, 'aGVsbG8='),
    ).rejects.toThrow(BadRequestException);
  });

  it('lets only an admin remove somebody else’s', async () => {
    const { service } = build();
    await expect(service.remove(frankie, 'dr')).rejects.toThrow(ForbiddenException);
    await expect(
      service.remove({ id: 'ad', email: 'a@x.com', role: Role.ADMIN }, 'dr'),
    ).resolves.toEqual({ removed: true });
  });

  it('shows staff who may not stamp no signatures and no log', async () => {
    const { service } = build();
    const overview = await service.overview(frankie);
    expect(overview).toMatchObject({ isProvider: false, canStamp: false, stampable: [], uses: [] });
  });
});

describe('SignaturesController', () => {
  const guards = (route: object) => Reflect.getMetadata(GUARDS_METADATA, route) ?? [];

  it('hands out a signature, and saves one, only behind the PIN', () => {
    for (const route of [
      SignaturesController.prototype.stamp,
      SignaturesController.prototype.mine,
      SignaturesController.prototype.save,
    ]) {
      expect(guards(route)).toContain(PayLockGuard);
    }
  });
});
