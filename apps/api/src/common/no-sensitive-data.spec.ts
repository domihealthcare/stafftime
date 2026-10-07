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
  const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

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

  it.each(['Employee', 'EmployeeCredential', 'EmployeePersonalRecord', 'EmploymentChange'])(
    'has no identity numbers on %s',
    (name) => {
      const body = model(name).toLowerCase();
      for (const field of forbidden) {
        expect(body).not.toContain(field.toLowerCase());
      }
    },
  );

  /// Staff profiles (October 2026, Dominguez) are the one deliberate step back
  /// from "not an HR system": an admin may keep somebody's home address, an
  /// emergency contact, and their pay and position over time. Decided out
  /// loud — and pinned here, so neither table grows a column without the
  /// same conversation, and none of it moves onto Employee, whose row goes
  /// out with rotas, timesheets and the Directory.
  /// The reps who book lunches (October 2026, Dominguez): business contacts,
  /// and only what was asked for. Pinned so the list never quietly becomes a
  /// CRM with somebody's home address in it.
  it('keeps the rep list to what was agreed', () => {
    const fields = model('Rep')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
      .map((line) => line.split(/\s+/)[0])
      .sort();
    expect(fields).toEqual(
      [
        'cellPhone',
        'company',
        'createdAt',
        'food',
        'id',
        'lunches',
        'medication',
        'name',
        'notes',
        'status',
        'updatedAt',
      ].sort(),
    );
  });

  it('keeps the admins-only staff record to what was agreed, off the Employee row', () => {
    const fieldsOf = (name: string) =>
      model(name)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
        .map((line) => line.split(/\s+/)[0])
        .sort();
    expect(fieldsOf('EmployeePersonalRecord')).toEqual(
      [
        'addressLine1',
        'addressLine2',
        'city',
        'emergencyContactName',
        'emergencyContactPhone',
        'emergencyContactRelationship',
        'employee',
        'employeeId',
        'postalCode',
        'state',
        'updatedAt',
        'updatedBy',
        'updatedById',
      ].sort(),
    );
    expect(fieldsOf('EmploymentChange')).toEqual(
      [
        'createdAt',
        'effectiveOn',
        'employee',
        'employeeId',
        'id',
        'kind',
        'note',
        'payRate',
        'payUnit',
        'position',
        'recordedBy',
        'recordedById',
        'updatedAt',
      ].sort(),
    );
    const employeeFields = fieldsOf('Employee');
    for (const field of employeeFields) {
      expect(field).not.toMatch(/^(address|street|city|postal|zip|emergency|salary|wage|payRate)/i);
    }
  });

  /// Birthdays arrived in September 2026 so colleagues can celebrate them —
  /// as a month and a day, deliberately never a year or a whole date of birth.
  it('keeps a birthday to the month and day, never the year', () => {
    const fields = model('Employee')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//'))
      .map((line) => line.split(/\s+/)[0]);
    const birthdayFields = fields.filter((field) => /birth/i.test(field));
    expect(birthdayFields.sort()).toEqual(['birthdayDay', 'birthdayMonth']);
    expect(model('Employee')).toMatch(/\n\s*birthdayMonth\s+Int\?/);
    expect(model('Employee')).toMatch(/\n\s*birthdayDay\s+Int\?/);
  });

  it('holds no personnel documents', () => {
    // StoredFile and PayrollExport keep bytes on purpose: a generated timesheet
    // is a file this app made, not a document somebody handed over.
    expect(schema).not.toMatch(/\nmodel ChecklistDocument \{/);
    expect(model('EmployeeCredential')).not.toContain('storageKey');
    expect(model('EmployeeChecklistTask')).not.toContain('requiresDocument');
  });

  it('files resources as links and written pages, never uploads', () => {
    // Uploads for resources may come one day, but as a decision made out loud
    // — see docs/open-questions.md — not as a column that slipped in.
    const body = model('Resource');
    for (const field of ['storageKey', 'fileId', 'mimeType', 'StoredFile', 'bytes']) {
      expect(body).not.toContain(field);
    }
  });

  /// The one upload the app takes (September 2026): a small photo of
  /// yourself. It must stay just that — the picture and when it changed —
  /// and never grow a caption, a file name or anything read from the camera.
  it('keeps a profile photo to the picture and nothing else', () => {
    const fields = model('EmployeePhoto')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
      .map((line) => line.split(/\s+/)[0]);
    expect(fields.sort()).toEqual(['bytes', 'contentType', 'employee', 'employeeId', 'updatedAt']);
  });

  /// Closing checklists are filled in at the front desk at the end of a day
  /// with patients. What somebody records is ticks and numbers — the wording
  /// is copied from the template, never typed — so a "notes" column here is
  /// exactly where a patient's name would end up.
  it('keeps a closing checklist to ticks and numbers, with nowhere to type', () => {
    const fieldsOf = (name: string) =>
      model(name)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
        .map((line) => line.split(/\s+/)[0])
        .sort();
    expect(fieldsOf('ClosingRecord')).toEqual(
      [
        'answers',
        'createdAt',
        'day',
        'employee',
        'employeeId',
        'gaps',
        'id',
        'location',
        'locationId',
        'positions',
        'submitted',
        'timeEntry',
        'timeEntryId',
      ].sort(),
    );
    expect(fieldsOf('ClosingAnswer')).toEqual(
      [
        'count',
        'done',
        'id',
        'itemId',
        'kind',
        'needed',
        'record',
        'recordId',
        'section',
        'sortOrder',
        'target',
        'text',
      ].sort(),
    );
  });

  it('records a credential by its date, not its number', () => {
    const body = model('EmployeeCredential');
    expect(body).toContain('expiresOn');
    expect(body).not.toMatch(/^\s*reference\s/m);
  });

  /// Surveys and the suggestion box were promised to be truly anonymous: the
  /// easiest way to break that is a harmless-looking `employeeId` or
  /// `createdAt` on the wrong table.
  it.each(['SurveyResponse', 'SurveyAnswer', 'Feedback'])(
    'keeps %s free of anything that says who, or exactly when',
    (name) => {
      const body = model(name);
      for (const field of [
        'employee',
        'author',
        'createdBy',
        'submittedBy',
        'createdAt',
        'updatedAt',
        'ip',
        'userAgent',
        'session',
      ]) {
        expect(body).not.toMatch(new RegExp(`^\\s*${field}\\w*\\s`, 'im'));
      }
    },
  );

  it('records that somebody took part, and nothing that links them to their answers', () => {
    const body = model('SurveyParticipant');
    expect(body).not.toMatch(/response/i);
    expect(body).not.toMatch(/createdAt|answeredAt/);
  });

  /// The clinical forms (the 99483 cognitive assessment, September 2026) are
  /// filled in and turned into PDFs entirely in the provider's browser: the
  /// patient's details never reach the server. There is no table for them, and
  /// the one easy way to change that is a model or column that sounds like one.
  it('holds no patient data: the clinical forms keep nothing on the server', () => {
    const names = [...schema.matchAll(/\nmodel (\w+) \{/g)].map((match) => match[1]);
    for (const name of names) {
      expect(name).not.toMatch(/patient|clinical|assessment|mrn|diagnos|carePlan|cognitive/i);
      const fields = model(name)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
        .map((line) => line.split(/\s+/)[0]);
      for (const field of fields) {
        expect(`${name}.${field}`).not.toMatch(
          /\.(patient|mrn|medicalRecord|diagnos|icd10|carePlan)/i,
        );
      }
    }
  });
  /// Provider productivity (September 2026) counts patients; it must never name
  /// one. A count is a number and a label, and the only free text anywhere in it
  /// is the short note on a statement, which the screen tells managers not to
  /// put a patient's name in.
  it('counts patients in productivity statements without identifying any', () => {
    const fieldsOf = (name: string) =>
      model(name)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
        .map((line) => line.split(/\s+/)[0])
        .sort();
    expect(fieldsOf('ProductivityCount')).toEqual(
      ['count', 'id', 'interval', 'intervalId', 'label', 'position'].sort(),
    );
    expect(fieldsOf('ProductivityInterval')).toEqual(
      [
        'counts',
        'endDate',
        'expected',
        'id',
        'position',
        'startDate',
        'statement',
        'statementId',
      ].sort(),
    );
    expect(fieldsOf('ProductivityStatement')).toEqual(
      [
        'carriesBalance',
        'createdAt',
        'createdBy',
        'createdById',
        'employee',
        'employeeId',
        'endDate',
        'id',
        'intervals',
        'multiplier',
        'note',
        'paidOn',
        'publishedAt',
        'publishedBy',
        'publishedById',
        'startDate',
        'updatedAt',
      ].sort(),
    );
  });
});
