import { NotFoundException } from '@nestjs/common';
import { PracticeEventKind, RepFood, RepStatus, Role } from '@prisma/client';
import { RepsService } from './reps.service';

const manager = { id: 'mgr-1', email: 'manager@domihealthcare.com', role: Role.MANAGER };
const NOW = new Date('2026-11-15T12:00:00.000Z');

function build(existing: unknown = { id: 'rep-1' }) {
  const rep = {
    findMany: jest.fn().mockResolvedValue([
      { id: 'rep-1', name: 'Jane Smith' },
      { id: 'rep-2', name: 'Pat Lee' },
    ]),
    findUnique: jest.fn().mockResolvedValue(existing),
    create: jest.fn(async ({ data }) => ({ id: 'rep-new', ...data })),
    update: jest.fn(async ({ data }) => ({ id: 'rep-1', ...data })),
    delete: jest.fn().mockResolvedValue({}),
  };
  const practiceEvent = {
    findMany: jest.fn().mockResolvedValue([
      { repId: 'rep-1', startsAt: new Date('2026-11-03T16:30:00.000Z') },
      { repId: 'rep-1', startsAt: new Date('2026-11-10T16:30:00.000Z') },
      { repId: 'rep-1', startsAt: new Date('2026-12-01T16:30:00.000Z') },
    ]),
    updateMany: jest.fn().mockResolvedValue({ count: 2 }),
  };
  const prisma = {
    rep,
    practiceEvent,
    $transaction: jest.fn(async (steps: Promise<unknown>[]) => Promise.all(steps)),
  };
  return { service: new RepsService(prisma as never), rep, practiceEvent };
}

const input = {
  name: '  Jane Smith ',
  company: ' Novo Nordisk ',
  medication: '',
  cellPhone: '(201) 555-0142',
  food: RepFood.CATERING,
  status: RepStatus.PREFERRED,
  notes: '   ',
};

describe('RepsService', () => {
  it('lists everybody with their last and next lunch', async () => {
    const { service } = build();
    const [jane, pat] = await service.list(NOW);
    expect(jane.lastLunch).toEqual(new Date('2026-11-10T16:30:00.000Z'));
    expect(jane.nextLunch).toEqual(new Date('2026-12-01T16:30:00.000Z'));
    expect(pat.lastLunch).toBeNull();
    expect(pat.nextLunch).toBeNull();
  });

  it('saves what was typed, trimmed, with blanks as nothing', async () => {
    const { service, rep } = build();
    await service.create(input, manager);
    expect(rep.create.mock.calls[0][0].data).toEqual({
      name: 'Jane Smith',
      company: 'Novo Nordisk',
      medication: null,
      cellPhone: '(201) 555-0142',
      food: RepFood.CATERING,
      status: RepStatus.PREFERRED,
      notes: null,
    });
  });

  it('renames their lunches when the name is corrected', async () => {
    const { service, practiceEvent } = build();
    await service.update('rep-1', { ...input, name: 'Jane Smith-Ortiz' }, manager);
    expect(practiceEvent.updateMany).toHaveBeenCalledWith({
      where: { repId: 'rep-1', kind: PracticeEventKind.REP_LUNCH },
      data: { title: 'Rep lunch: Jane Smith-Ortiz' },
    });
  });

  it('is not found once removed', async () => {
    const { service } = build(null);
    await expect(service.update('rep-1', input, manager)).rejects.toThrow(NotFoundException);
    await expect(service.remove('rep-1', manager)).rejects.toThrow(NotFoundException);
  });
});
