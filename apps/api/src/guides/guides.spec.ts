import { GuideKey, Role } from '@prisma/client';
import { GUIDE_SLUGS, canEditGuide, canReadGuide } from './guides';

describe('who reads and keeps the guides', () => {
  it('lets everybody read the front desk guide', () => {
    expect(canReadGuide(GuideKey.FRONT_DESK, Role.EMPLOYEE, false)).toBe(true);
  });

  it.each([GuideKey.RESULTS_PLAYBOOK, GuideKey.INPATIENT_NOTES])(
    'keeps %s to providers, managers and admins',
    (key) => {
      expect(canReadGuide(key, Role.EMPLOYEE, false)).toBe(false);
      expect(canReadGuide(key, Role.EMPLOYEE, true)).toBe(true);
      expect(canReadGuide(key, Role.MANAGER, false)).toBe(true);
      expect(canReadGuide(key, Role.ADMIN, false)).toBe(true);
    },
  );

  it('lets only managers and admins change them', () => {
    expect(canEditGuide(Role.EMPLOYEE)).toBe(false);
    expect(canEditGuide(Role.MANAGER)).toBe(true);
    expect(canEditGuide(Role.ADMIN)).toBe(true);
  });

  it('knows the three guides by their addresses', () => {
    expect(Object.keys(GUIDE_SLUGS).sort()).toEqual(
      ['front-desk', 'inpatient-notes', 'results-playbook'].sort(),
    );
  });
});
