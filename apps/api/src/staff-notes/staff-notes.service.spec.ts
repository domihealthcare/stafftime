import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { aboutThemselves, mayEdit, mayRemove, mayUseNotes, noteProblem } from './staff-notes';
import { StaffNotesService } from './staff-notes.service';

const manager: AuthUser = { id: 'mgr', email: 'm@x', role: Role.MANAGER };
const otherManager: AuthUser = { id: 'mgr2', email: 'm2@x', role: Role.MANAGER };
const admin: AuthUser = { id: 'adm', email: 'a@x', role: Role.ADMIN };
const employee: AuthUser = { id: 'emp', email: 'e@x', role: Role.EMPLOYEE };

const person = (id: string) => ({
  id,
  firstName: id,
  lastName: 'Test',
  preferredName: null,
  postNominals: null,
  photoUpdatedAt: null,
  employmentStatus: 'ACTIVE',
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  employeeId: 'emp',
  authorId: 'mgr',
  kind: null,
  body: 'Late twice this week.',
  createdAt: new Date('2026-11-02T14:00:00Z'),
  editedAt: null,
  employee: person('emp'),
  author: person('mgr'),
  ...over,
});

function build() {
  const prisma = {
    staffNote: {
      findMany: jest.fn().mockResolvedValue([row()]),
      findUnique: jest.fn().mockResolvedValue({ id: 'n1', employeeId: 'emp', authorId: 'mgr' }),
      create: jest.fn().mockResolvedValue(row()),
      update: jest.fn().mockResolvedValue(row({ editedAt: new Date() })),
      delete: jest.fn().mockResolvedValue({}),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue([person('emp')]),
      findFirst: jest.fn().mockResolvedValue({ id: 'emp' }),
    },
  };
  return { prisma, service: new StaffNotesService(prisma as never) };
}

describe('staff note rules', () => {
  it('are for managers and admins only', () => {
    expect(mayUseNotes(manager)).toBe(true);
    expect(mayUseNotes(admin)).toBe(true);
    expect(mayUseNotes(employee)).toBe(false);
  });

  it('never about yourself', () => {
    expect(aboutThemselves(manager, 'mgr')).toBe(true);
    expect(aboutThemselves(manager, 'emp')).toBe(false);
  });

  it('the writer edits; the writer or an admin removes', () => {
    const note = { authorId: 'mgr' };
    expect(mayEdit(manager, note)).toBe(true);
    expect(mayEdit(otherManager, note)).toBe(false);
    expect(mayEdit(admin, note)).toBe(false);
    expect(mayRemove(otherManager, note)).toBe(false);
    expect(mayRemove(admin, note)).toBe(true);
    // A note whose writer was removed: nobody edits it, an admin removes it.
    expect(mayEdit(manager, { authorId: null })).toBe(false);
    expect(mayRemove(admin, { authorId: null })).toBe(true);
  });

  it('needs words, and not too many', () => {
    expect(noteProblem('   ')).toBe('Write the note.');
    expect(noteProblem('x'.repeat(2001))).toMatch(/at most 2000/);
    expect(noteProblem('Spoke about punctuality.')).toBeNull();
  });
});

describe('StaffNotesService', () => {
  it('reads every note except those about the reader, and offers everybody else', async () => {
    const { service, prisma } = build();
    const result = await service.list(manager);
    expect(prisma.staffNote.findMany.mock.calls[0][0].where).toEqual({
      employeeId: { not: 'mgr' },
    });
    expect(prisma.employee.findMany.mock.calls[0][0].where).toMatchObject({
      id: { not: 'mgr' },
      isSharedAccount: false,
    });
    expect(result.notes[0]).toMatchObject({ canEdit: true, canRemove: true });
  });

  it('refuses staff', async () => {
    const { service } = build();
    await expect(service.list(employee)).rejects.toThrow(ForbiddenException);
    await expect(service.create({ employeeId: 'mgr', body: 'Hi' }, employee)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a note about yourself', async () => {
    const { service, prisma } = build();
    await expect(service.create({ employeeId: 'mgr', body: 'Hi' }, manager)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.staffNote.create).not.toHaveBeenCalled();
  });

  it('writes a note with its writer, trimmed', async () => {
    const { service, prisma } = build();
    await service.create({ employeeId: 'emp', kind: 'PRAISE', body: '  Great week.  ' }, manager);
    expect(prisma.staffNote.create.mock.calls[0][0].data).toEqual({
      employeeId: 'emp',
      authorId: 'mgr',
      kind: 'PRAISE',
      body: 'Great week.',
    });
  });

  it('only the writer edits, and an edit is marked', async () => {
    const { service, prisma } = build();
    await expect(service.update('n1', { body: 'Changed' }, otherManager)).rejects.toThrow(
      ForbiddenException,
    );
    await service.update('n1', { body: 'Changed' }, manager);
    expect(prisma.staffNote.update.mock.calls[0][0].data.editedAt).toBeInstanceOf(Date);
  });

  it('another manager cannot remove a note; an admin can', async () => {
    const { service, prisma } = build();
    await expect(service.remove('n1', otherManager)).rejects.toThrow(ForbiddenException);
    await service.remove('n1', admin);
    expect(prisma.staffNote.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
  });

  it('a note about the reader is not found, even by id', async () => {
    const { service, prisma } = build();
    prisma.staffNote.findUnique.mockResolvedValue({ id: 'n2', employeeId: 'adm', authorId: 'mgr' });
    await expect(service.remove('n2', admin)).rejects.toThrow(NotFoundException);
  });
});
