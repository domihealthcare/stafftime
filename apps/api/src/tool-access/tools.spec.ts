import { Role } from '@prisma/client';
import { TOOLS, mayUse } from './tools';

const tool = (key: string) => TOOLS.find((entry) => entry.key === key)!;

describe('who may use a built-in form or guide', () => {
  it('lets everybody use one set for everyone', () => {
    expect(
      mayUse(
        tool('phone-book'),
        { key: 'phone-book', everyone: true, jobRoleIds: [] },
        Role.EMPLOYEE,
        [],
      ),
    ).toBe(true);
  });

  it('keeps one set for job roles to the people holding one of them', () => {
    const setting = { key: 'apcm', everyone: false, jobRoleIds: ['ma', 'provider'] };
    expect(mayUse(tool('apcm'), setting, Role.EMPLOYEE, ['ma'])).toBe(true);
    expect(mayUse(tool('apcm'), setting, Role.EMPLOYEE, ['front-desk'])).toBe(false);
  });

  it('lets managers and admins open them, except the BrainCheck Care Plan', () => {
    const none = (key: string) => ({ key, everyone: false, jobRoleIds: [] });
    expect(mayUse(tool('apcm'), none('apcm'), Role.MANAGER, [])).toBe(true);
    expect(mayUse(tool('results-playbook'), none('results-playbook'), Role.ADMIN, [])).toBe(true);
    expect(mayUse(tool('braincheck'), none('braincheck'), Role.ADMIN, [])).toBe(false);
  });

  it('starts as it was: phone book and diagnostics for everyone, the rest by job role', () => {
    expect(tool('phone-book').defaults).toBe('everyone');
    const ma = { name: 'Medical Assistant', usesClinicalForms: false, usesWellnessForm: true };
    const provider = { name: 'Provider', usesClinicalForms: true, usesWellnessForm: true };
    const desk = { name: 'Front Desk', usesClinicalForms: false, usesWellnessForm: false };
    const fits = (key: string, role: typeof ma) => {
      const defaults = tool(key).defaults;
      return defaults !== 'everyone' && defaults(role);
    };
    expect(fits('apcm', ma)).toBe(true);
    expect(fits('wellness', provider)).toBe(true);
    expect(fits('braincheck', ma)).toBe(false);
    expect(fits('front-desk', desk)).toBe(true);
    expect(fits('front-desk', ma)).toBe(false);
  });
});
