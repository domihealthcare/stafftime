import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordGuessService } from '../auth/password-guesses.service';
import { PasswordService } from '../auth/password.service';
import { PinService } from '../kiosk/pin.service';
import { ProfileService } from './profile.service';

/// A 256 × 256 baseline JPEG header — all the photo checks look at.
function fakeJpeg(): Buffer {
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(9, 2);
  sof[4] = 8;
  sof.writeUInt16BE(256, 5);
  sof.writeUInt16BE(256, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]), sof]);
}

function build(passwordHash: string | null = null) {
  let row: Record<string, unknown> = {
    pinHash: null,
    pinUpdatedAt: null,
    passwordHash,
    failedLoginAttempts: 0,
    lockedUntil: null,
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
    jobRoles: [
      {
        isPrimary: false,
        jobRole: { id: 'ma', name: 'Medical Assistant', colour: 'teal', sortOrder: 20 },
      },
      { isPrimary: true, jobRole: { id: 'fd', name: 'Front Desk', colour: 'blue', sortOrder: 10 } },
    ],
    locations: [{ isPrimary: true, location: { id: 'nb', name: 'North Bergen' } }],
  };
  const photos = new Map<string, unknown>();
  const inbox = { notify: jest.fn(async () => undefined) };
  const prisma = {
    employee: {
      count: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === 'e1' ? 1 : 0)),
      findUniqueOrThrow: jest.fn(async () => row),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        for (const [k, v] of Object.entries(data)) {
          if (v === undefined) continue;
          const increment = (v as { increment?: number } | null)?.increment;
          row = { ...row, [k]: increment === undefined ? v : Number(row[k]) + increment };
        }
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
    service: new ProfileService(
      prisma as never,
      new PasswordGuessService(prisma as never, new PasswordService(), new ConfigService()),
      new PinService(),
      inbox as never,
    ),
    prisma,
    inbox,
    photos,
    row: () => row,
  };
}

describe('your profile', () => {
  it('flattens job roles and offices for the screen', async () => {
    const { service } = build();
    const profile = await service.get('e1');
    // Their main job role first.
    expect(profile.jobRoles).toEqual([
      { id: 'fd', name: 'Front Desk', colour: 'blue', isPrimary: true },
      { id: 'ma', name: 'Medical Assistant', colour: 'teal', isPrimary: false },
    ]);
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

  it('your own photo tells nobody', async () => {
    const { service, photos, inbox } = build();
    await service.setPhoto('e1', fakeJpeg().toString('base64'));
    expect(photos.has('e1')).toBe(true);
    expect(inbox.notify).not.toHaveBeenCalled();
  });

  it('a photo an admin puts up for somebody tells them, without the photo', async () => {
    const { service, photos, inbox } = build();
    await service.setPhoto('e1', fakeJpeg().toString('base64'), 'admin');
    expect(photos.has('e1')).toBe(true);
    expect(inbox.notify).toHaveBeenCalledWith(
      ['e1'],
      expect.objectContaining({ kind: 'PROFILE_PHOTO', link: '/profile' }),
    );
  });

  it('an admin cannot put a photo on somebody who does not exist', async () => {
    const { service, photos } = build();
    await expect(
      service.setPhoto('nobody', fakeJpeg().toString('base64'), 'admin'),
    ).rejects.toThrow(NotFoundException);
    expect(photos.size).toBe(0);
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

    it('counts a wrong password against signing in', async () => {
      // Otherwise a browser left signed in offers unlimited guesses at it.
      const { service, row } = build(await passwords.hash('harbour lantern 7'));
      await service.setOwnPin('e1', 'guess', '4817').catch(() => undefined);
      expect(row().failedLoginAttempts).toBe(1);
    });

    it('is held to the same rules as any PIN', async () => {
      const { service } = build(await passwords.hash('harbour lantern 7'));
      await expect(service.setOwnPin('e1', 'harbour lantern 7', '1234')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
