import { PtoType } from '@prisma/client';
import { clashFacts, declineWording } from './decline-wording';
import { TimeOffClash } from './time-off-clashes';

const clash: TimeOffClash = {
  from: '2026-12-22',
  to: '2026-12-22',
  locationId: 'nb',
  locationName: 'North Bergen',
  jobRoleId: 'ma',
  jobRoleName: 'Medical Assistant',
  total: 3,
  off: [
    { employeeId: 'a', name: 'Ana L', requestId: 'r1', approved: true, isHalfDay: false },
    { employeeId: 'b', name: 'Bea M', requestId: 'r2', approved: false, isHalfDay: false },
  ],
  minimum: null,
};

describe('clashFacts', () => {
  it('says how many would be off, never who', () => {
    const [fact] = clashFacts([clash]);
    expect(fact).toBe('2 of 3 in Medical Assistant at North Bergen would be off on Tue, Dec 22.');
    expect(fact).not.toContain('Ana');
    expect(fact).not.toContain('Bea');
  });

  it('names the minimum when there is one, and a run of days as a range', () => {
    expect(
      clashFacts([{ ...clash, to: '2026-12-24', minimum: 2, off: clash.off.slice(0, 1) }])[0],
    ).toBe(
      '1 of 3 in Medical Assistant at North Bergen would be off from Tue, Dec 22 to Thu, Dec 24 (the minimum is 2).',
    );
  });
});

describe('declineWording', () => {
  function prisma() {
    return {
      ptoRequest: {
        findUnique: jest.fn().mockResolvedValue({
          type: PtoType.VACATION,
          startDate: new Date('2026-12-22T00:00:00Z'),
          endDate: new Date('2026-12-22T00:00:00Z'),
          isHalfDay: false,
          employeeId: 'emp-1',
          employee: { firstName: 'Frankie', preferredName: null },
        }),
      },
    };
  }

  it('sends the first name, the dates and the manager’s reason, and trims what comes back', async () => {
    const ai = {
      json: jest.fn().mockResolvedValue({ reason: '  Sorry Frankie — we need you that day.  ' }),
    };
    await expect(
      declineWording(ai as never, prisma() as never, 'req-1', 'mgr-1', 'christmas week is full'),
    ).resolves.toBe('Sorry Frankie — we need you that day.');
    const [managerId, request] = ai.json.mock.calls[0];
    expect(managerId).toBe('mgr-1');
    expect(request.prompt).toContain('Person: Frankie');
    expect(request.prompt).toContain('Asked for: PTO, Tue, Dec 22');
    expect(request.prompt).toContain("The manager's reason: christmas week is full");
    expect(request.system).toContain('Never name or hint at which colleagues are off.');
  });

  it('has nothing to offer when the AI service declines', async () => {
    const ai = { json: jest.fn().mockResolvedValue(null) };
    await expect(
      declineWording(ai as never, prisma() as never, 'req-1', 'mgr-1', 'busy'),
    ).resolves.toBeNull();
  });
});
