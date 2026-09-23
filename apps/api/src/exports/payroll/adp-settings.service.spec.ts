import { BadRequestException } from '@nestjs/common';
import { AdpSettingsService } from './adp-settings.service';

const WORKSHEET = [
  '!PAYDATA,Worksheet',
  'Co Code,Batch ID,File #,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount',
  '!',
  'DMH,,001234,,,,',
  'DMH,,001235,,,,',
  '!END',
].join('\r\n');

function build(staffWithoutNumber: { firstName: string; lastName: string }[] = []) {
  let row: Record<string, unknown> = {
    singleton: 1,
    companyCode: null,
    headerRows: null,
    footerRows: null,
    regularColumn: null,
    overtimeColumn: null,
    updatedAt: new Date('2026-09-23T12:00:00Z'),
  };
  const prisma = {
    adpSettings: {
      findUnique: jest.fn(async () => row),
      create: jest.fn(),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        row = { ...row, ...data };
        return row;
      }),
    },
    employee: { findMany: jest.fn().mockResolvedValue(staffWithoutNumber) },
  };
  return { service: new AdpSettingsService(prisma as never), prisma, stored: () => row };
}

describe('ADP settings', () => {
  it('lists what is missing on a fresh deployment, in order', async () => {
    const { service } = build();
    const status = await service.status();
    expect(status.missing).toEqual([
      'Enter the ADP company code.',
      'Paste a worksheet exported from ADP, so the file has ADP’s own header rows.',
    ]);
    expect(status.updatedAt).toBeNull();
  });

  it('keeps only the header and footer rows of a pasted worksheet', async () => {
    const { service, stored } = build();
    const result = await service.update({ worksheet: WORKSHEET }, 'admin-1');

    expect(result.employeeRowsDropped).toBe(2);
    expect(stored().headerRows).toBe(
      '!PAYDATA,Worksheet\nCo Code,Batch ID,File #,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount\n!',
    );
    expect(stored().footerRows).toBe('!END');
    // ADP's copy of the staff list is not kept anywhere.
    expect(JSON.stringify(stored())).not.toContain('001234');
  });

  it('suggests the regular and overtime columns from the worksheet', async () => {
    const { service } = build();
    const result = await service.update({ worksheet: WORKSHEET, companyCode: 'dmh' }, 'admin-1');
    expect(result).toMatchObject({
      companyCode: 'DMH',
      regularColumn: 'Reg Hours',
      overtimeColumn: 'O/T Hours',
      missing: [],
    });
    expect(result.columns.slice(0, 3)).toEqual(['Co Code', 'Batch ID', 'File #']);
  });

  it('turns a worksheet it cannot read into a clear refusal', async () => {
    const { service } = build();
    await expect(service.update({ worksheet: 'Name,Hours\nDan,40' }, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses a column the worksheet does not have, or one of the required three', async () => {
    const { service } = build();
    await service.update({ worksheet: WORKSHEET }, 'admin-1');
    await expect(service.update({ regularColumn: 'Salary' }, 'admin-1')).rejects.toThrow(
      /not one of the worksheet/,
    );
    await expect(service.update({ regularColumn: 'File #' }, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('will not put regular and overtime hours in the same column', async () => {
    const { service } = build();
    await service.update({ worksheet: WORKSHEET }, 'admin-1');
    await expect(service.update({ overtimeColumn: 'Reg Hours' }, 'admin-1')).rejects.toThrow(
      /different columns/,
    );
  });

  it('refuses to choose columns before a worksheet is pasted', async () => {
    const { service } = build();
    await expect(service.update({ regularColumn: 'Reg Hours' }, 'admin-1')).rejects.toThrow(
      /Paste a worksheet/,
    );
  });

  it('names active staff who still need a File #', async () => {
    const { service } = build([{ firstName: 'Julia', lastName: 'Santos' }]);
    expect((await service.status()).staffWithoutFileNumber).toEqual(['Julia Santos']);
  });
});
