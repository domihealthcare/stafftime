import { Role } from '@prisma/client';
import { AssistantSources, runTool, toolsFor } from './assistant-tools';

// Friday 9 October 2026, 2pm in New Jersey.
const NOW = new Date('2026-10-09T18:00:00Z');
const frankie = { id: 'emp-1', email: 'frontdesk@domihealthcare.com', role: Role.EMPLOYEE };
const morgan = { id: 'mgr-1', email: 'manager@domihealthcare.com', role: Role.MANAGER };

function sources(): AssistantSources & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {};
  const log = (name: string, args: unknown) => (calls[name] = [...(calls[name] ?? []), args]);
  return {
    calls,
    shifts: async (query) => {
      log('shifts', query);
      return [
        {
          startsAt: new Date('2026-10-13T13:00:00Z'),
          endsAt: new Date('2026-10-13T21:00:00Z'),
          status: 'PUBLISHED',
          isRemote: false,
          notes: 'Upstairs',
          employee: { firstName: 'Max', preferredName: null, lastName: 'Assistant' },
          location: { name: 'West New York' },
          jobRole: { name: 'Medical Assistant' },
        },
        {
          startsAt: new Date('2026-10-14T13:00:00Z'),
          endsAt: new Date('2026-10-14T21:00:00Z'),
          status: 'DRAFT',
          isRemote: true,
          notes: null,
          employee: null,
          location: { name: 'North Bergen' },
          jobRole: null,
        },
      ];
    },
    balance: async () => ({
      vacation: { remaining: 12, pending: 1, available: 15 },
      sick: { remaining: 5, pending: 0, available: 5 },
      yearEnd: '2026-12-31',
    }),
    timeOff: async (query) => {
      log('timeOff', query);
      return [];
    },
    events: async () => [],
    payDays: async () => ['2026-10-16'],
    directory: async () => [
      {
        firstName: 'Frankie',
        preferredName: null,
        lastName: 'Front-Desk',
        email: 'frontdesk@domihealthcare.com',
        phone: '201-555-0100',
        onLeave: false,
        jobRoles: [{ name: 'Front Desk' }],
        locations: [{ name: 'North Bergen' }],
        onNow: { location: { name: 'North Bergen' }, remote: false },
        homeToday: null,
      },
      {
        firstName: 'Max',
        preferredName: null,
        lastName: 'Assistant',
        onLeave: false,
        jobRoles: [{ name: 'Medical Assistant' }],
        locations: [{ name: 'West New York' }],
        onNow: null,
        homeToday: null,
      },
    ],
    attention: async () => ({ missedShifts: ['Max — Tue'], openShifts: [] }),
  };
}

describe('what Ask Domi Staff can look up', () => {
  it('offers staff their own things only, and managers the rota as well', () => {
    expect(toolsFor(frankie).map((tool) => tool.name)).toEqual([
      'my_schedule',
      'my_time_off',
      'practice_calendar',
      'pay_days',
      'directory',
    ]);
    expect(toolsFor(morgan).map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['rota', 'time_off_requests', 'needs_attention']),
    );
  });

  it('refuses a manager’s tool to staff even if asked for', async () => {
    const from = sources();
    const result = await runTool('rota', { date: '2026-10-13' }, frankie, from, NOW);
    expect(result).toEqual({
      content: 'rota is not something this person can look up.',
      isError: true,
    });
    expect(from.calls.shifts).toBeUndefined();
  });

  it('reads my_schedule as the asker, published only, in New Jersey time', async () => {
    const from = sources();
    const result = await runTool(
      'my_schedule',
      { from: '2026-10-12', to: '2026-10-18' },
      frankie,
      from,
      NOW,
    );
    expect(from.calls.shifts).toEqual([
      expect.objectContaining({ employeeId: 'emp-1', publishedOnly: true }),
    ]);
    expect(JSON.parse(result.content)).toEqual([
      {
        day: '2026-10-13',
        from: '09:00',
        until: '17:00',
        where: 'West New York',
        jobRole: 'Medical Assistant',
        note: 'Upstairs',
      },
    ]);
  });

  it('turns a bad or too-long range back as words, not a crash', async () => {
    const from = sources();
    expect(
      await runTool('my_schedule', { from: 'Monday', to: '2026-10-18' }, frankie, from, NOW),
    ).toEqual({ content: '"from" must be a date, YYYY-MM-DD.', isError: true });
    expect(
      (await runTool('pay_days', { from: '2026-01-01', to: '2026-12-31' }, frankie, from, NOW))
        .content,
    ).toBe('Ask for at most 62 days at a time.');
  });

  it('gives a manager the whole rota, open shifts and drafts marked', async () => {
    const rows = JSON.parse(
      (await runTool('rota', { date: '2026-10-14' }, morgan, sources(), NOW)).content,
    );
    expect(rows).toEqual([
      {
        who: 'Open shift — nobody yet',
        day: '2026-10-14',
        from: '09:00',
        until: '17:00',
        where: 'working from home',
        draft: true,
      },
    ]);
  });

  it('narrows the Directory by name, and leaves out empty round-up sections', async () => {
    const people = JSON.parse(
      (await runTool('directory', { name: 'front' }, frankie, sources(), NOW)).content,
    );
    expect(people).toEqual([
      expect.objectContaining({ name: 'Frankie Front-Desk', inNow: 'North Bergen' }),
    ]);
    expect(
      JSON.parse((await runTool('needs_attention', {}, morgan, sources(), NOW)).content),
    ).toEqual({
      missedShifts: ['Max — Tue'],
    });
  });
});
