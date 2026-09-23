import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  describe('hashing', () => {
    it('produces an argon2id hash that verifies', async () => {
      const hash = await service.hash('a perfectly fine passphrase');
      expect(hash.startsWith('$argon2id$')).toBe(true);
      expect(await service.verify('a perfectly fine passphrase', hash)).toBe(true);
    });

    it('rejects the wrong password', async () => {
      const hash = await service.hash('a perfectly fine passphrase');
      expect(await service.verify('a perfectly fine passphras', hash)).toBe(false);
    });

    it('salts, so the same password hashes differently each time', async () => {
      const [first, second] = await Promise.all([
        service.hash('a perfectly fine passphrase'),
        service.hash('a perfectly fine passphrase'),
      ]);
      expect(first).not.toEqual(second);
    });

    it('treats a malformed stored hash as a failed verification, not a crash', async () => {
      await expect(service.verify('anything', 'not-a-hash')).resolves.toBe(false);
      await expect(service.verify('anything', '')).resolves.toBe(false);
    });

    it('accepts a long passphrase unchanged', async () => {
      const long = 'correct horse battery staple '.repeat(5).trim();
      const hash = await service.hash(long);
      expect(await service.verify(long, hash)).toBe(true);
    });
  });

  describe('policy', () => {
    const ok = (password: string, context = {}) => service.check(password, context).ok;

    it('accepts a reasonable passphrase', () => {
      expect(ok('breakfast lamp 7')).toBe(true);
    });

    // The rule Dominguez chose in September 2026: 8 characters and a number.
    it('requires at least 8 characters', () => {
      expect(ok('tulip7x')).toBe(false);
      expect(ok('tulip7xz')).toBe(true);
    });

    it('requires a number', () => {
      expect(ok('breakfast lamp')).toBe(false);
      expect(ok('correct horse battery staple')).toBe(false);
      expect(service.check('breakfast lamp')).toEqual({
        ok: false,
        reason: 'Include at least one number.',
      });
    });

    it('lets a short password through when it has a number and no obvious base', () => {
      expect(ok('Sunflowr8')).toBe(true);
      expect(ok('blue7kite')).toBe(true);
    });

    // Every case below meets the length and has a number, so it must be the
    // blocklist rejecting it rather than the rule firing first.
    it('rejects a weak base padded out to reach the length limit', () => {
      for (const padded of [
        'password1234',
        'Password!!!!',
        'qwerty123456',
        'letmein12345',
        'changeme1234',
        'welcome12345',
        'password1',
        'Password1',
        'qwerty12',
      ]) {
        expect(padded.length).toBeGreaterThanOrEqual(8);
        expect(ok(padded)).toBe(false);
      }
    });

    it('rejects the practice and location names, padded or not', () => {
      expect(ok('domihealthcare2026')).toBe(false);
      expect(ok('northbergen12')).toBe(false);
      expect(ok('westnewyork99')).toBe(false);
    });

    it('rejects a long keyboard or counting run', () => {
      expect(ok('qwertyuiopas')).toBe(false);
      expect(ok('123456789012')).toBe(false);
      expect(ok('abcdefghijkl')).toBe(false);
      expect(ok('0987654321zz')).toBe(false);
    });

    it('rejects digits only, however long', () => {
      expect(ok('837465928374')).toBe(false);
      expect(ok('8374-6592-8374')).toBe(false);
    });

    it('rejects a password built from too few distinct characters', () => {
      expect(ok('abababababab')).toBe(false);
      expect(ok('aaaaaaaaaaaaaaa')).toBe(false);
    });

    it('rejects a password containing the user own name or email', () => {
      const context = {
        email: 'frankie.frontdesk@domihealthcare.com',
        firstName: 'Frankie',
        lastName: 'Front-Desk',
      };
      expect(ok('frankie-loves-cats-4', context)).toBe(false);
      expect(ok('my front-desk chair 4', context)).toBe(false);
      expect(ok('breakfast lamp 7', context)).toBe(true);
    });

    it('ignores a name fragment too short to be meaningful', () => {
      // "ma" would otherwise reject half the dictionary.
      expect(ok('tomato marmalade 3', { email: 'ma@domihealthcare.com' })).toBe(true);
    });

    it('rejects an absurdly long password rather than hashing it', () => {
      expect(ok('a'.repeat(201) + 'bc')).toBe(false);
    });

    it('accepts ordinary strong passphrases', () => {
      for (const good of [
        'breakfast lamp 7',
        'harbour lantern 7',
        'Th3 Quick Br0wn Fox!',
        'correct horse battery 42',
        'blue7kite',
      ]) {
        expect(ok(good)).toBe(true);
      }
    });

    it('gives a reason the user can act on', () => {
      const verdict = service.check('short');
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.reason).toBe('Use at least 8 characters, including a number.');
      }
    });
  });
});
