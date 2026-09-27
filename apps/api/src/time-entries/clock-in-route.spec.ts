import { ForbiddenException } from '@nestjs/common';
import { ClockMethod, Role } from '@prisma/client';
import { TimeEntriesController } from './time-entries.controller';

/**
 * A kiosk punch skips the location check, so it may only come from the time
 * clock. On the ordinary clock-in route anybody signed in could otherwise
 * claim to be one — from home, and on a colleague's behalf.
 */
describe('the phone clock-in route', () => {
  const employee = { id: 'emp-1', email: 'x@y.z', role: Role.EMPLOYEE };

  function build() {
    const timeEntries = { clockIn: jest.fn().mockResolvedValue({ id: 'entry-1' }) };
    return { controller: new TimeEntriesController(timeEntries as never), timeEntries };
  }

  it('refuses a punch that claims to be from the time clock', () => {
    const { controller, timeEntries } = build();
    expect(() =>
      controller.clockIn(
        { locationId: 'loc-1', method: ClockMethod.KIOSK, employeeId: 'emp-2' },
        employee,
        '203.0.113.7',
      ),
    ).toThrow(ForbiddenException);
    expect(timeEntries.clockIn).not.toHaveBeenCalled();
  });

  it('passes an ordinary phone punch through', async () => {
    const { controller, timeEntries } = build();
    await controller.clockIn({ locationId: 'loc-1', method: ClockMethod.WEB }, employee, '203.0.113.7');
    expect(timeEntries.clockIn).toHaveBeenCalled();
  });
});
