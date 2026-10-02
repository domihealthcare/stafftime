import { FeedbackService } from './feedback.service';

function build() {
  const prisma = { feedback: { create: jest.fn().mockResolvedValue({}) } };
  return { service: new FeedbackService(prisma as never), prisma };
}

describe('FeedbackService', () => {
  // 11:40pm in New Jersey is already tomorrow in UTC.
  const lateEvening = new Date('2026-10-02T03:40:00Z');

  it('keeps the message, the kind picked and the day — nothing else', async () => {
    const { service, prisma } = build();
    await service.post('  A shout-out for Maria at the front desk  ', 'SHOUT_OUT', lateEvening);

    expect(prisma.feedback.create).toHaveBeenCalledWith({
      data: {
        message: 'A shout-out for Maria at the front desk',
        kind: 'SHOUT_OUT',
        receivedOn: new Date('2026-10-01T00:00:00Z'),
      },
    });
  });

  it('leaves the kind empty when none was picked', async () => {
    const { service, prisma } = build();
    await service.post('More parking please', undefined, lateEvening);
    expect(prisma.feedback.create.mock.calls[0][0].data.kind).toBeNull();
  });
});
