import { BadRequestException } from '@nestjs/common';
import { A_PERSON, assertAPerson } from './people';

describe('shared accounts (common/people.ts)', () => {
  it('is the filter for "the people who work here"', () => {
    expect(A_PERSON).toEqual({ isSharedAccount: false });
  });

  it('refuses a shared account where only a person will do, and lets a person through', async () => {
    const shared = { employee: { count: jest.fn().mockResolvedValue(1) } };
    await expect(assertAPerson(shared as never, 'office', 'Not on a shift.')).rejects.toThrow(
      new BadRequestException('Not on a shift.'),
    );
    expect(shared.employee.count).toHaveBeenCalledWith({
      where: { id: 'office', isSharedAccount: true },
    });

    const person = { employee: { count: jest.fn().mockResolvedValue(0) } };
    await expect(assertAPerson(person as never, 'frankie', 'Not on a shift.')).resolves.toBe(
      undefined,
    );
  });
});
