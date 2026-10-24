import { Role } from '@prisma/client';
import { forViewer } from './locations.controller';

const row = {
  id: 'a',
  name: 'North Bergen',
  timezone: 'America/New_York',
  latitude: 40.8,
  longitude: -74.0,
  geofenceRadiusFeet: 500,
  allowedIps: ['203.0.113.7'],
};

describe('what staff are told about an office', () => {
  it('keeps the pin, geofence and allowed addresses to admins', () => {
    expect(forViewer(row, { id: 'x', role: Role.ADMIN } as never)).toEqual(row);
  });

  it.each([Role.EMPLOYEE, Role.MANAGER])('hides them from %s but keeps the name', (role) => {
    expect(forViewer(row, { id: 'x', role } as never)).toEqual({
      id: 'a',
      name: 'North Bergen',
      timezone: 'America/New_York',
    });
  });
});
