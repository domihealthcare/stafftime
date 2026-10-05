import { PinService } from './pin.service';

describe('PinService', () => {
  const service = new PinService();
  const ok = (pin: string) => service.check(pin).ok;

  describe('hashing', () => {
    it('produces an argon2 hash that verifies', async () => {
      const hash = await service.hash('4817');
      expect(hash.startsWith('$argon2id$')).toBe(true);
      expect(await service.verify('4817', hash)).toBe(true);
    });

    it('rejects a wrong PIN, including a near miss', async () => {
      const hash = await service.hash('4817');
      expect(await service.verify('4818', hash)).toBe(false);
      expect(await service.verify('481', hash)).toBe(false);
    });

    it('salts, so two people with the same PIN do not share a hash', async () => {
      const [first, second] = await Promise.all([service.hash('4817'), service.hash('4817')]);
      expect(first).not.toEqual(second);
    });

    it('treats a malformed stored hash as a failed verification', async () => {
      await expect(service.verify('4817', 'garbage')).resolves.toBe(false);
    });
  });

  describe('policy', () => {
    it('accepts an unremarkable PIN', () => {
      expect(ok('4817')).toBe(true);
      expect(ok('80531')).toBe(true);
      expect(ok('62039184')).toBe(true);
    });

    it('requires 4 to 8 digits', () => {
      expect(ok('481')).toBe(false);
      expect(ok('481739205')).toBe(false);
    });

    it('rejects anything that is not digits', () => {
      expect(ok('48a7')).toBe(false);
      expect(ok('4 81')).toBe(false);
      expect(ok('')).toBe(false);
    });

    it('rejects a repeated digit', () => {
      expect(ok('1111')).toBe(false);
      expect(ok('00000000')).toBe(false);
    });

    it('rejects consecutive runs in both directions', () => {
      expect(ok('1234')).toBe(false);
      expect(ok('4321')).toBe(false);
      expect(ok('456789')).toBe(false);
      expect(ok('98765432')).toBe(false);
    });

    it('still rejects the most common repeated pairs, from the short list', () => {
      expect(ok('1212')).toBe(false);
      expect(ok('123123')).toBe(false);
      expect(ok('1122')).toBe(false);
    });

    it('allows years and other repeated patterns (Dominguez, October 2026)', () => {
      // Refused until October 2026, which turned away PINs people remember.
      expect(ok('1911')).toBe(true);
      expect(ok('1985')).toBe(true);
      expect(ok('2004')).toBe(true);
      expect(ok('3636')).toBe(true);
      expect(ok('45454545')).toBe(true);
    });

    it('rejects known keypad favourites', () => {
      for (const pin of ['2580', '0852', '6969', '1004']) {
        expect(ok(pin)).toBe(false);
      }
    });

    it('gives a reason the admin can act on', () => {
      const verdict = service.check('1234');
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.reason).toMatch(/consecutive|easy to guess/i);
      }
    });
  });
});
