import { GuideKey, Role } from '@prisma/client';
import { GUIDE_LABELS, GUIDE_SLUGS, canEditGuide } from './guides';

describe('who reads and keeps the guides', () => {
  it('names each guide, for its access message', () => {
    for (const slug of Object.keys(GUIDE_SLUGS)) expect(GUIDE_LABELS[slug]).toBeTruthy();
    expect(GUIDE_SLUGS['front-desk']).toBe(GuideKey.FRONT_DESK);
  });

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
