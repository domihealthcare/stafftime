import { payrollStateOf, withPayroll } from './payroll-state';

const run = (id: string, generatedAt: string) => ({
  export: { id, target: 'spreadsheet', generatedAt: new Date(generatedAt) },
});

describe('payrollStateOf', () => {
  it('reports hours that have never been sent', () => {
    expect(payrollStateOf({ editedAt: null, payrollExports: [] })).toEqual({
      exported: false,
      exportedAt: null,
      exportId: null,
      changedSinceExport: false,
    });
  });

  it('an edit before any export is not a change since the export', () => {
    // Corrected on the 5th, sent on the 8th: payroll has the corrected figure.
    expect(
      payrollStateOf({
        editedAt: new Date('2026-09-05T10:00:00Z'),
        payrollExports: [run('exp-1', '2026-09-08T09:00:00Z')],
      }),
    ).toMatchObject({ exported: true, changedSinceExport: false });
  });

  it('an edit after the export is the case that matters', () => {
    // Sent on the 8th, corrected on the 9th: payroll has the old figure, and
    // somebody has to carry the difference into a later run.
    expect(
      payrollStateOf({
        editedAt: new Date('2026-09-09T10:00:00Z'),
        payrollExports: [run('exp-1', '2026-09-08T09:00:00Z')],
      }),
    ).toMatchObject({ exported: true, changedSinceExport: true });
  });

  it('measures against the most recent run, which is the one listed first', () => {
    // Re-exported on the 10th, so the correction on the 9th did reach payroll.
    expect(
      payrollStateOf({
        editedAt: new Date('2026-09-09T10:00:00Z'),
        payrollExports: [
          run('exp-2', '2026-09-10T09:00:00Z'),
          run('exp-1', '2026-09-08T09:00:00Z'),
        ],
      }),
    ).toMatchObject({ exportId: 'exp-2', changedSinceExport: false });
  });

  it('an edit at the same instant as the export does not count as after it', () => {
    expect(
      payrollStateOf({
        editedAt: new Date('2026-09-08T09:00:00Z'),
        payrollExports: [run('exp-1', '2026-09-08T09:00:00Z')],
      }),
    ).toMatchObject({ changedSinceExport: false });
  });

  it('treats an entry with only voided runs as never sent', () => {
    // Voided runs are filtered out by the query, so an empty list here means
    // nothing that still counts has gone out.
    expect(payrollStateOf({ editedAt: new Date(), payrollExports: [] })).toMatchObject({
      exported: false,
      changedSinceExport: false,
    });
  });
});

describe('withPayroll', () => {
  it('keeps the entry and adds the state, without losing anything', () => {
    const entry = { id: 'te-1', editedAt: null, payrollExports: [], clockInAt: new Date() };
    const decorated = withPayroll(entry);

    expect(decorated.id).toBe('te-1');
    expect(decorated.clockInAt).toBe(entry.clockInAt);
    expect(decorated.payroll.exported).toBe(false);
  });
});
