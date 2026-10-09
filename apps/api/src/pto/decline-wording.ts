import { NotFoundException } from '@nestjs/common';
import { PtoType } from '@prisma/client';
import { AiService, stringFields } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { loadTimeOffClashes, shortDate, TimeOffClash } from './time-off-clashes';

/**
 * "Help me word it" when declining time off (October 2026, Dominguez — an AI
 * idea): a short, kind reason for the person, from the manager's own few
 * words, to edit before it is sent.
 *
 * What goes to the AI service: the person's first name, the kind of time off
 * and the dates, what the manager typed, and — when the manager typed
 * nothing — how many in that job role at that office would be off, as counts.
 * Never a colleague's name: staff do not see each other's time off, and the
 * reason is shown to the person.
 */

export const MAX_REASON = 500;

const RULES = `You help a manager at Domi Healthcare, a primary care practice in New Jersey, word the reason for declining a staff member's time off request. The person reads it in the app.

- Two or three short sentences, warm and plain, addressed to the person by first name.
- Give the reason the manager gave, without adding new ones. If the manager gave none, use the staffing facts given, in general words ("we would be short at the front desk that day").
- Never name or hint at which colleagues are off.
- Where it fits, invite them to talk to the manager about other dates. No promises the manager did not make.
- Under ${MAX_REASON} characters. Plain text, no greeting line or sign-off beyond the sentences themselves.`;

const SCHEMA = stringFields({ reason: 'The reason, as the person will read it' });

const KIND: Partial<Record<PtoType, string>> = {
  [PtoType.SICK]: 'sick time',
  [PtoType.VACATION]: 'PTO',
};

/// "2 of 3 in Medical Assistant at North Bergen would be off on Tue, Dec 22"
/// — counts only.
export function clashFacts(clashes: TimeOffClash[]): string[] {
  return clashes.slice(0, 4).map((clash) => {
    const when =
      clash.from === clash.to
        ? `on ${shortDate(clash.from)}`
        : `from ${shortDate(clash.from)} to ${shortDate(clash.to)}`;
    const count =
      clash.off.length >= clash.total
        ? `all ${clash.total}`
        : `${clash.off.length} of ${clash.total}`;
    return `${count} in ${clash.jobRoleName} at ${clash.locationName} would be off ${when}${
      clash.minimum !== null ? ` (the minimum is ${clash.minimum})` : ''
    }.`;
  });
}

export async function declineWording(
  ai: AiService,
  prisma: PrismaService,
  requestId: string,
  managerId: string,
  notes: string,
): Promise<string | null> {
  const request = await prisma.ptoRequest.findUnique({
    where: { id: requestId },
    select: {
      type: true,
      startDate: true,
      endDate: true,
      isHalfDay: true,
      employeeId: true,
      employee: { select: { firstName: true, preferredName: true } },
    },
  });
  if (!request) throw new NotFoundException(`Request ${requestId} not found`);

  const from = request.startDate.toISOString().slice(0, 10);
  const to = request.endDate.toISOString().slice(0, 10);
  const facts =
    notes.trim() === ''
      ? clashFacts(await loadTimeOffClashes(prisma, from, to, { employeeId: request.employeeId }))
      : [];
  const when = from === to ? shortDate(from) : `${shortDate(from)} to ${shortDate(to)}`;
  const prompt = [
    `Person: ${request.employee.preferredName ?? request.employee.firstName}`,
    `Asked for: ${KIND[request.type] ?? 'time off'}, ${when}${request.isHalfDay ? ' (half day)' : ''}`,
    notes.trim() ? `The manager's reason: ${notes.trim()}` : 'The manager gave no reason.',
    ...(facts.length ? ['Staffing those days:', ...facts] : []),
  ].join('\n');

  const result = await ai.json<{ reason: string }>(managerId, {
    system: RULES,
    prompt,
    schema: SCHEMA,
  });
  return result ? result.reason.trim().slice(0, MAX_REASON) : null;
}
