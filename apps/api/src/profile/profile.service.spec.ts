import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { PinService } from '../kiosk/pin.service';
import { ProfileService } from './profile.service';

function build(passwordHash: string | null = null) {
  let row: Record<string, unknown> = {
    pinHash: null,
    pinUpdatedAt: null,
    passwordHash,
    id: 'e1',
    firstName: 'Frankie',
    lastName: 'Front-Desk',
    preferredName: null,
    pronouns: null,
    email: 'frontdesk@domihealthcare.com',
    phone: null,
    about: null,
    photoUpdatedAt: null,
    role: 'EMPLOYEE',
    jobRoles: [{ jobRole: { id: 'fd', name: 'Front Desk', colour: 'blue' } }],
    locations: [{ isPrimary: true, location: { id: 'nb', name: 'North Bergen' } }],
  };
  const photos = new Map<string, unknown>();
  const prisma = {
    employee: {
      findUniqueOrThrow: jest.fn(async () => row),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        for (const [k, v] of Object.entries(data)) if (v !== undefined) row = { ...row, [k]: v };
        return row;
      }),
    },
    employeePhoto: {
      upsert: jest.fn(async ({ create }: { create: { employeeId: string } }) =>
        photos.set(create.employeeId, create),
      ),
      deleteMany: jest.fn(async ({ where }: { where: { employeeId: string } }) =>
        photos.delete(where.employeeId),
      ),
      findUnique: jest.fn(
        async ({ where }: { where: { employeeId: string } }) =>
          photos.get(where.employeeId) ?? null,
      ),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return {
    service: new ProfileService(prisma as never, new PasswordService(), new PinService()),
    prisma,
    photos,
    row: () => row,
  };
}

describe('your profile', () => {
  it('flattens job roles and offices for the screen', async () => {
    const { service } = build();
    const profile = await service.get('e1');
    expect(profile.jobRoles).toEqual([{ id: 'fd', name: 'Front Desk', colour: 'blue' }]);
    expect(profile.locations).toEqual([{ id: 'nb', name: 'North Bergen', isPrimary: true }]);
  });

  it('saves what you type, tidied, and clears a field left empty', async () => {
    const { service, row } = build();
    await service.update('e1', { phone: ' (201)  555-0142 ', pronouns: 'she/her', about: '' });
    expect(row()).toMatchObject({ phone: '(201) 555-0142', pronouns: 'she/her', about: null });
  });

  it('leaves a field alone when it is not sent', async () => {
    const { service, prisma } = build();
    await service.update('e1', { pronouns: 'they/them' });
    expect(prisma.employee.update.mock.calls[0][0].data.phone).toBeUndefined();
  });

  it('turns a photo it cannot accept into a clear refusal', async () => {
    const { service } = build();
    await expect(service.setPhoto('e1', 'bm90IGEgcGhvdG8=')).rejects.toThrow(BadRequestException);
  });

  it('removing a photo clears the version too', async () => {
    const { service, row, photos } = build();
    photos.set('e1', { bytes: Buffer.from('x') });
    await service.removePhoto('e1', 'e1');
    expect(photos.has('e1')).toBe(false);
    expect(row().photoUpdatedAt).toBeNull();
  });

  describe('your own tablet PIN', () => {
    const passwords = new PasswordService();

    it('is set after your password is confirmed, and never shown', async () => {
      const { service, row } = build(await passwords.hash('harbour lantern 7'));
      const profile = await service.setOwnPin('e1', 'harbour lantern 7', '4817');
      expect(profile.hasPin).toBe(true);
      expect(JSON.stringify(profile)).not.toContain('4817');
      expect(profile).not.toHaveProperty('pinHash');
      expect(String(row().pinHash)).not.toContain('4817');
    });

    it('is refused with the wrong password', async () => {
      const { service } = build(await passwords.hash('harbour lantern 7'));
      await expect(service.setOwnPin('e1', 'guess', '4817')).rejects.toThrow(ForbiddenException);
    });

    it('is held to the same rules as any PIN', async () => {
      const { service } = build(await passwords.hash('harbour lantern 7'));
      await expect(service.setOwnPin('e1', 'harbour lantern 7', '1234')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
