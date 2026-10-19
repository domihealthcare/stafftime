import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/// The portal does not use em dashes (October 2026, Dominguez: "for all the
/// portal and going forward don't use em dashes"). Use a plain hyphen, a comma
/// or a new sentence. This fails on any in the code the portal is made of, so
/// one cannot come back by accident (the character is built from its code here so
/// that this file has none either).
const EM_DASH = String.fromCharCode(0x2014);
const ROOTS = [join(__dirname, '..'), join(__dirname, '..', '..', '..', 'web', 'src')];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : files(path);
    return /\.(ts|tsx|css|html)$/.test(name) ? [path] : [];
  });
}

describe('the portal has no em dashes', () => {
  it('in the API or the web app', () => {
    const found = ROOTS.flatMap(files).filter((path) =>
      readFileSync(path, 'utf8').includes(EM_DASH),
    );
    expect(found).toEqual([]);
  });
});
