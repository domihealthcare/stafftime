import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdjustPtoBalanceDto, CreatePtoRequestDto } from './pto.dto';

const problems = async <T extends object>(type: new () => T, body: object) =>
  (await validate(plainToInstance(type, body))).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );

describe('AdjustPtoBalanceDto', () => {
  it('takes whole and half days, and blanks', async () => {
    expect(
      await problems(AdjustPtoBalanceDto, {
        vacationUsed: 4,
        sickUsed: 1.5,
        vacationDaysPerYear: 20,
        sickDaysPerYear: null,
        vacationCarriedOver: 0,
      }),
    ).toEqual([]);
  });

  it('refuses anything else, in words', async () => {
    expect(await problems(AdjustPtoBalanceDto, { vacationUsed: 0.3 })).toEqual([
      'PTO already taken must be whole or half days.',
    ]);
    expect(await problems(AdjustPtoBalanceDto, { sickUsed: -1 })).toEqual([
      'Sick days already taken cannot be below 0.',
    ]);
    expect(await problems(AdjustPtoBalanceDto, { vacationDaysPerYear: 400 })).toEqual([
      'Their yearly PTO cannot be more than a year.',
    ]);
  });
});

describe('CreatePtoRequestDto', () => {
  const dates = { startDate: '2026-11-02', endDate: '2026-11-02' };

  it('takes sick and PTO', async () => {
    expect(await problems(CreatePtoRequestDto, { ...dates, type: 'SICK' })).toEqual([]);
    expect(await problems(CreatePtoRequestDto, { ...dates, type: 'VACATION' })).toEqual([]);
  });

  it('no longer takes the other kinds', async () => {
    expect(await problems(CreatePtoRequestDto, { ...dates, type: 'PERSONAL' })).toEqual([
      'Time off is either Sick or PTO.',
    ]);
  });
});
