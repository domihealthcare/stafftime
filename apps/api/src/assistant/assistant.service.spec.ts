import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AssistantService, DAILY_QUESTIONS, MODEL } from './assistant.service';

const NOW = new Date('2026-10-09T18:00:00Z');
const frankie = { id: 'emp-1', email: 'frontdesk@domihealthcare.com', role: Role.EMPLOYEE };

function build({ key = 'sk-test', asked = 1 }: { key?: string | null; asked?: number } = {}) {
  const prisma = {
    assistantUsage: { upsert: jest.fn().mockResolvedValue({ questions: asked }) },
    employee: {
      findUnique: jest.fn().mockResolvedValue({
        firstName: 'Frankie',
        preferredName: null,
        lastName: 'Front-Desk',
        jobRoles: [{ jobRole: { name: 'Front Desk' } }],
        locations: [{ location: { name: 'North Bergen' } }],
      }),
    },
  };
  const shifts = { findAll: jest.fn().mockResolvedValue([]) };
  const config = { get: jest.fn(() => key ?? undefined) };
  const service = new AssistantService(
    config as never,
    prisma as never,
    shifts as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const create = jest.fn();
  if (key) {
    (service as unknown as { client: unknown }).client = { beta: { messages: { create } } };
  }
  return { service, prisma, shifts, create };
}

describe('Ask Domi Staff', () => {
  it('is off, and sends nothing, with no API key', async () => {
    const { service } = build({ key: null });
    expect(service.enabled).toBe(false);
    await expect(service.ask('When am I on?', [], frankie, NOW)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('stops at the daily limit before asking anybody', async () => {
    const { service, create } = build({ asked: DAILY_QUESTIONS + 1 });
    await expect(service.ask('When am I on?', [], frankie, NOW)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('looks things up with the tools, as the asker, then answers', async () => {
    const { service, create, shifts } = build();
    create
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'thinking', thinking: '', signature: 'x' },
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'my_schedule',
            input: { from: '2026-10-12', to: '2026-10-18' },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'You are not on the rota next week.' }],
      });

    await expect(service.ask('Am I on next week?', [], frankie, NOW)).resolves.toEqual({
      answer: 'You are not on the rota next week.',
      left: DAILY_QUESTIONS - 1,
    });

    expect(shifts.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'emp-1', status: 'PUBLISHED' }),
      { withoutDrafts: true },
    );
    const first = create.mock.calls[0][0];
    expect(first).toMatchObject({
      model: MODEL,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(first.tools.map((tool: { name: string }) => tool.name)).not.toContain('rota');
    expect(first.system[1].text).toContain('Today is Friday, October 9, 2026.');
    // The assistant's turn goes back whole, then the tool's answer.
    const second = create.mock.calls[1][0];
    expect(second.messages.at(-2).content[0].type).toBe('thinking');
    expect(second.messages.at(-1).content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'call-1',
      content: '[]',
    });
  });

  it('says so plainly when the request is declined', async () => {
    const { service, create } = build();
    create.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
    await expect(service.ask('Something odd', [], frankie, NOW)).resolves.toMatchObject({
      answer: 'Sorry — I can’t help with that one.',
    });
  });

  it('starts the conversation with the person, and refuses an empty question', async () => {
    const { service, create } = build();
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hi' }] });
    await service.ask(
      'And Tuesday?',
      [
        { role: 'assistant', text: 'Hello!' },
        { role: 'user', text: 'When am I on Monday?' },
        { role: 'assistant', text: '9 to 5.' },
      ],
      frankie,
      NOW,
    );
    expect(create.mock.calls[0][0].messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    await expect(service.ask('   ', [], frankie, NOW)).rejects.toThrow('Type a question first.');
  });
});
