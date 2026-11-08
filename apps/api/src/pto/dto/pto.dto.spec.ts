import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdjustPtoBalanceDto, CreatePtoRequestDto, ReviewPtoRequestDto } from './pto.dto';

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

  it('takes sick, PTO and unpaid', async () => {
    expect(await problems(CreatePtoRequestDto, { ...dates, type: 'SICK' })).toEqual([]);
    expect(await problems(CreatePtoRequestDto, { ...dates, type: 'VACATION' })).toEqual([]);
    expect(await problems(CreatePtoRequestDto, { ...dates, type: 'UNPAID' })).toEqual([]);
  });

  it('no longer takes the other kinds', async () => {
    expect(await problems(CreatePtoRequestDto, { ...dates, type: 'PERSONAL' })).toEqual([
      'Time off is Sick, PTO or Unpaid.',
    ]);
  });
});

describe('ReviewPtoRequestDto per-shift choices', () => {
  const ID = '3f1c3b9e-5a0e-4c5e-9c1e-1d6f6f2d9a11';
  const nested = async (body: object) => {
    const errors = await validate(plainToInstance(ReviewPtoRequestDto, body));
    return errors.length;
  };

  it('takes a list of shift choices', async () => {
    expect(
      await nested({
        decision: 'APPROVED',
        perShift: [
          { shiftId: ID, action: 'ASK', employeeIds: [ID] },
          { shiftId: ID, action: 'KEEP' },
        ],
      }),
    ).toBe(0);
  });

  it('refuses a bad action or a shift id that is not an id', async () => {
    expect(
      await nested({ decision: 'APPROVED', perShift: [{ shiftId: ID, action: 'DROP' }] }),
    ).toBe(1);
    expect(
      await nested({ decision: 'APPROVED', perShift: [{ shiftId: 'x', action: 'OPEN' }] }),
    ).toBe(1);
  });
});
