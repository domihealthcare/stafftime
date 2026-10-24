import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AnnouncementsService } from './announcements.service';

describe('showing a post publicly', () => {
  const service = new AnnouncementsService({} as never, {} as never, {} as never);
  const create = (role: Role) =>
    service.create(
      { title: 't', body: 'b', showOnTimeClock: true } as never,
      {
        id: 'u',
        role,
      } as never,
    );

  it('is refused to anybody but an admin, before anything is read or written', async () => {
    await expect(create(Role.EMPLOYEE)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(create(Role.MANAGER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('is refused on an edit too', async () => {
    await expect(
      service.update(
        'id',
        { showOnTimeClock: true } as never,
        { id: 'u', role: Role.EMPLOYEE } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
