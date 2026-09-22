import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A guard on a deliberate product decision, not on a line of code.
 *
 * This is a timekeeping app. It records that somebody worked, and that a
 * licence runs out on the 13th so the practice can be chased about it. It does
 * not hold social security numbers, licence numbers, or scans of anything —
 * those belong in the personnel file, wherever the practice keeps it, and a
 * clock-in app is the wrong place for a breach to happen.
 *
 * The easiest way to undo that is to add a column, because a column looks
 * harmless in a pull request. This test reads the schema and fails if one shows
 * up, so the decision has to be made again out loud rather than by accident.
 */
describe('what this app deliberately does not store', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  /// Everything between `model X {` and the closing brace at column 0.
  function model(name: string): string {
    const match = schema.match(new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`No model ${name} in schema.prisma`);
    return match[1];
  }

  const forbidden = [
    'ssn',
    'socialSecurity',
    'taxId',
    'dateOfBirth',
    'dob',
    'bankAccount',
    'routingNumber',
    'driversLicense',
    'passportNumber',
  ];

  it.each(['Employee', 'EmployeeCredential'])('has no identity numbers on %s', (name) => {
    const body = model(name).toLowerCase();
    for (const field of forbidden) {
      expect(body).not.toContain(field.toLowerCase());
    }
  });

  it('holds no personnel documents', () => {
    // StoredFile and PayrollExport keep bytes on purpose: a generated timesheet
    // is a file this app made, not a document somebody handed over.
    expect(schema).not.toMatch(/\nmodel ChecklistDocument \{/);
    expect(model('EmployeeCredential')).not.toContain('storageKey');
    expect(model('EmployeeChecklistTask')).not.toContain('requiresDocument');
  });

  it('records a credential by its date, not its number', () => {
    const body = model('EmployeeCredential');
    expect(body).toContain('expiresOn');
    expect(body).not.toMatch(/^\s*reference\s/m);
  });
});
