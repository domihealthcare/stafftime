import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallMessageKey, EmploymentStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { numberToRing, toE164 } from '../common/util/phone';
import {
  addDaysTo,
  localDateIn,
  localTimeIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RoutingContact, RoutingPlan } from '../call-routing/routing-plan';
import { LookupData, OnCallAnswer, segmentsBetween, whoIsOnCallAt } from './call-routing-lookup';
import { isEnglishVoice, isSpanishVoice } from './call-voices';
import { CallRoutingSettingsInput, OnCallCoverInput } from './dto/call-routing.dto';
import { named, PERSON, PROVIDER, WORKING } from './on-call.service';

const MAX_VIEW_DAYS = 62;
const MAX_COVER_HOURS = 14 * 24;
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const DIALLER = {
  ...PERSON,
  phone: true,
  onCallPhone: true,
  employmentStatus: true,
  isSharedAccount: true,
} satisfies Prisma.EmployeeSelect;

type Dialler = Prisma.EmployeeGetPayload<{ select: typeof DIALLER }>;

/// How many days of overrides one request may list.
const MAX_LIST_DAYS = 100;

const COVER_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  note: true,
  employee: { select: PERSON },
  backup: { select: PERSON },
  setBy: { select: PERSON },
} satisfies Prisma.OnCallCoverSelect;

type CoverRow = Prisma.OnCallCoverGetPayload<{ select: typeof COVER_SELECT }>;

/**
 * Reads the on-call schedule for the after-hours phone line (November 2026):
 * who to ring now, the managers' 60-day view, time-range covers and the
 * line's settings. The rules of who is on call are in `call-routing-lookup.ts`.
 */
@Injectable()
export class OnCallRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------- reading

  /// Everything the lookup needs for `from` up to `to`.
  async loadLookupData(from: Date, to: Date): Promise<LookupData> {
    const firstDay = addDaysTo(localDateIn(from, PRACTICE_ZONE), -2);
    const lastDay = addDaysTo(localDateIn(to, PRACTICE_ZONE), 1);
    const [rotas, days, covers, settings] = await Promise.all([
      this.prisma.onCallRota.findMany({
        select: {
          startsOn: true,
          changesAt: true,
          entries: {
            select: { weekday: true, weekOfMonth: true, employeeId: true, backupEmployeeId: true },
          },
        },
      }),
      this.prisma.onCallDay.findMany({
        where: { date: { gte: toUtcDate(firstDay), lte: toUtcDate(lastDay) } },
        select: { date: true, employeeId: true, backupEmployeeId: true, swapId: true },
      }),
      this.prisma.onCallCover.findMany({
        where: { startsAt: { lt: to }, endsAt: { gt: from } },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          employeeId: true,
          backupEmployeeId: true,
          createdAt: true,
        },
      }),
      this.prisma.callRoutingSettings.findUnique({
        where: { id: 1 },
        select: { defaultProviderId: true },
      }),
    ]);
    return {
      rotas: rotas.map((rota) => ({
        startsOn: isoDate(rota.startsOn),
        changesAt: rota.changesAt,
        entries: rota.entries,
      })),
      days: new Map(
        days.map((day) => [
          isoDate(day.date),
          {
            employeeId: day.employeeId,
            backupEmployeeId: day.backupEmployeeId,
            swapped: !!day.swapId,
          },
        ]),
      ),
      covers,
      defaultProviderId: settings?.defaultProviderId ?? null,
    };
  }

  /// Whom to ring at a moment. Runs on every call, so it stays lean.
  async planAt(at: Date = new Date()): Promise<RoutingPlan> {
    const data = await this.loadLookupData(at, new Date(at.getTime() + 60_000));
    const answer: OnCallAnswer = whoIsOnCallAt(at, data);
    const ids = [answer.employeeId, answer.backupEmployeeId, data.defaultProviderId].filter(
      (id): id is string => !!id,
    );
    const rows = ids.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: [...new Set(ids)] } },
          select: DIALLER,
        })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const problems: string[] = [];

    const contact = (id: string | null, role: string): RoutingContact | null => {
      if (!id) return null;
      const person = byId.get(id);
      if (!person) {
        problems.push(`The ${role} is no longer on staff.`);
        return null;
      }
      const name = named(person).name;
      if (!isWorking(person.employmentStatus)) {
        problems.push(`${name} is no longer working here.`);
        return null;
      }
      if (person.isSharedAccount) {
        problems.push(`${name} is a shared account, which cannot take calls.`);
        return null;
      }
      const ring = numberToRing(person);
      if (!ring) {
        problems.push(`${name} has no phone number that can be dialled.`);
        return null;
      }
      return { employeeId: person.id, name, phone: ring.phone };
    };

    const chosen = contact(answer.employeeId, 'provider on call');
    const backupContact = contact(answer.backupEmployeeId, 'backup');
    // The default provider is looked at once, so a problem is named once.
    const defaultContact =
      data.defaultProviderId === answer.employeeId
        ? chosen
        : data.defaultProviderId === answer.backupEmployeeId
          ? backupContact
          : contact(data.defaultProviderId, 'default provider');
    // Nobody dialable on call: their backup steps up before the default
    // provider, as the schedule meant them to be next.
    const onCall = chosen ?? backupContact ?? defaultContact;
    const backup =
      backupContact && backupContact.employeeId !== onCall?.employeeId ? backupContact : null;
    const fallback =
      defaultContact &&
      defaultContact.employeeId !== onCall?.employeeId &&
      defaultContact.employeeId !== backup?.employeeId
        ? defaultContact
        : null;
    return { onCall, backup, fallback, source: answer.source, problems };
  }

  /// The managers' view: stretches of time, covers and the people in them.
  async routingView(actor: AuthUser, from: string, days = MAX_VIEW_DAYS) {
    this.assertManager(actor);
    if (!DATE_ONLY.test(from ?? '')) throw new BadRequestException('Give the first day as a date.');
    if (!Number.isInteger(days) || days < 1 || days > MAX_VIEW_DAYS) {
      throw new BadRequestException(`Ask for 1 to ${MAX_VIEW_DAYS} days.`);
    }
    const start = zonedTimeToUtc(from, '00:00', PRACTICE_ZONE);
    const end = zonedTimeToUtc(addDaysTo(from, days), '00:00', PRACTICE_ZONE);
    const data = await this.loadLookupData(start, end);
    const segments = segmentsBetween(start, end, data);
    const coverRows = await this.prisma.onCallCover.findMany({
      where: { startsAt: { lt: end }, endsAt: { gt: start } },
      orderBy: { startsAt: 'asc' },
      select: COVER_SELECT,
    });
    const providers = await this.providerList();
    const known = new Set(providers.map((p) => p.id));
    const extra = new Set<string>();
    for (const s of segments) {
      for (const id of [s.employeeId, s.backupEmployeeId]) if (id && !known.has(id)) extra.add(id);
    }
    const others = extra.size
      ? await this.prisma.employee.findMany({ where: { id: { in: [...extra] } }, select: PERSON })
      : [];
    return {
      from,
      days,
      segments: segments.map((s) => ({
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        employeeId: s.employeeId,
        backupEmployeeId: s.backupEmployeeId,
        source: s.source,
        coverId: s.coverId,
        turnDate: s.turnDate,
      })),
      covers: coverRows.map(coverView),
      people: [...providers, ...others.map(named)],
      providers,
      defaultProviderId: data.defaultProviderId,
    };
  }

  // ----------------------------------------------------------------- covers

  /// Every override touching New Jersey days `from` to `to` (inclusive), by
  /// start. Who may read them is checked by the caller (as the schedule).
  async listCovers(from: string, to: string) {
    if (!DATE_ONLY.test(from ?? '') || !DATE_ONLY.test(to ?? '') || to < from) {
      throw new BadRequestException(
        'Give the days as from and to, the first no later than the last.',
      );
    }
    if (addDaysTo(from, MAX_LIST_DAYS) < to) {
      throw new BadRequestException(`At most ${MAX_LIST_DAYS} days at a time.`);
    }
    const start = zonedTimeToUtc(from, '00:00', PRACTICE_ZONE);
    const end = zonedTimeToUtc(addDaysTo(to, 1), '00:00', PRACTICE_ZONE);
    const rows = await this.prisma.onCallCover.findMany({
      where: { startsAt: { lt: end }, endsAt: { gt: start } },
      orderBy: { startsAt: 'asc' },
      select: COVER_SELECT,
    });
    return rows.map(coverView);
  }

  /// The override running at a moment, if any: the one made last wins.
  async coverAt(at: Date) {
    const row = await this.prisma.onCallCover.findFirst({
      where: { startsAt: { lte: at }, endsAt: { gt: at } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: COVER_SELECT,
    });
    return row ? coverView(row) : null;
  }

  async createCover(dto: OnCallCoverInput, actor: AuthUser, now = new Date()) {
    this.assertManager(actor);
    const checked = await this.checkCover(dto, now);
    const row = await this.prisma.onCallCover.create({
      data: { ...checked, setById: actor.id },
      select: COVER_SELECT,
    });
    await this.tellCover(row, actor, 'added');
    return coverView(row);
  }

  async updateCover(id: string, dto: OnCallCoverInput, actor: AuthUser, now = new Date()) {
    this.assertManager(actor);
    await this.requireCover(id);
    const checked = await this.checkCover(dto, now);
    const row = await this.prisma.onCallCover.update({
      where: { id },
      // A changed cover counts as the newest, so it wins any overlap as the
      // manager would expect.
      data: { ...checked, setById: actor.id, createdAt: now },
      select: COVER_SELECT,
    });
    await this.tellCover(row, actor, 'changed');
    return coverView(row);
  }

  async deleteCover(id: string, actor: AuthUser) {
    this.assertManager(actor);
    const row = await this.prisma.onCallCover.findUnique({ where: { id }, select: COVER_SELECT });
    if (!row) throw new NotFoundException('That cover is no longer there.');
    await this.prisma.onCallCover.delete({ where: { id } });
    await this.tellCover(row, actor, 'removed');
  }

  // --------------------------------------------------------------- settings

  async settings(actor?: AuthUser) {
    if (actor) this.assertManager(actor);
    const [row, messages, providers] = await Promise.all([
      this.prisma.callRoutingSettings.findUnique({ where: { id: 1 } }),
      this.prisma.callMessage.findMany(),
      this.prisma.employee.findMany({
        where: PROVIDER,
        select: DIALLER,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);
    const saved = new Map(messages.map((m) => [m.key, m]));
    return {
      defaultProviderId: row?.defaultProviderId ?? null,
      voiceEn: row?.voiceEn ?? 'Polly.Joanna-Neural',
      voiceEs: row?.voiceEs ?? 'Polly.Lupe-Neural',
      ringSeconds: row?.ringSeconds ?? 20,
      messages: Object.values(CallMessageKey).map((key) => ({
        key,
        text: saved.get(key)?.text ?? '',
        audioUrl: saved.get(key)?.audioUrl ?? null,
      })),
      providers: providers.map((p: Dialler) => ({
        id: p.id,
        name: named(p).name,
        phone: p.phone,
        onCallPhone: p.onCallPhone,
        // The number the line rings, and whether it is their on-call number
        // or the Directory phone.
        rings: numberToRing(p)?.phone ?? null,
        ringsFrom: numberToRing(p)?.from ?? null,
        dialable: dialable(p),
      })),
      line: {
        switchedOn: Boolean(this.config.get<string>('TWILIO_AUTH_TOKEN')),
        number: this.config.get<string>('TWILIO_PHONE_NUMBER') || null,
        fallbackSet: Boolean(toE164(this.config.get<string>('ONCALL_FALLBACK_PHONE'))),
      },
    };
  }

  async saveSettings(dto: CallRoutingSettingsInput, actor: AuthUser) {
    this.assertManager(actor);
    if (!isEnglishVoice(dto.voiceEn))
      throw new BadRequestException('Choose an English voice from the list.');
    if (!isSpanishVoice(dto.voiceEs))
      throw new BadRequestException('Choose a Spanish voice from the list.');
    if (!Number.isInteger(dto.ringSeconds) || dto.ringSeconds < 10 || dto.ringSeconds > 60) {
      throw new BadRequestException('Ring for 10 to 60 seconds.');
    }
    const defaultProviderId = dto.defaultProviderId || null;
    if (defaultProviderId) await this.assertProviders([defaultProviderId]);

    const seen = new Set<string>();
    const messages = dto.messages.map((message) => {
      if (seen.has(message.key)) throw new BadRequestException('Each message can be given once.');
      seen.add(message.key);
      const text = (message.text ?? '').trim();
      if (text.length < 1 || text.length > 1500) {
        throw new BadRequestException('Each message needs 1 to 1500 characters.');
      }
      return { key: message.key, text, audioUrl: cleanAudioUrl(message.audioUrl) };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.callRoutingSettings.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          defaultProviderId,
          voiceEn: dto.voiceEn,
          voiceEs: dto.voiceEs,
          ringSeconds: dto.ringSeconds,
          updatedById: actor.id,
        },
        update: {
          defaultProviderId,
          voiceEn: dto.voiceEn,
          voiceEs: dto.voiceEs,
          ringSeconds: dto.ringSeconds,
          updatedById: actor.id,
        },
      });
      for (const message of messages) {
        await tx.callMessage.upsert({
          where: { key: message.key },
          create: { ...message, updatedById: actor.id },
          update: { text: message.text, audioUrl: message.audioUrl, updatedById: actor.id },
        });
      }
    });
    return this.settings();
  }

  // ---------------------------------------------------------------- helpers

  private assertManager(actor: AuthUser) {
    if (actor.role !== Role.MANAGER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only managers and admins can do this.');
    }
  }

  private async assertProviders(ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await this.prisma.employee.count({ where: { id: { in: unique }, ...PROVIDER } });
    if (count !== unique.length) throw new BadRequestException('Only providers can be on call.');
  }

  private async providerList() {
    const rows = await this.prisma.employee.findMany({
      where: PROVIDER,
      select: PERSON,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map(named);
  }

  private async requireCover(id: string) {
    const found = await this.prisma.onCallCover.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('That cover is no longer there.');
  }

  /// Times, length and people checked; what to save.
  private async checkCover(dto: OnCallCoverInput, now: Date) {
    if (!LOCAL_TIME.test(dto.startsAt ?? '') || !LOCAL_TIME.test(dto.endsAt ?? '')) {
      throw new BadRequestException('Give the start and end as a date and time.');
    }
    const startsAt = fromLocal(dto.startsAt);
    const endsAt = fromLocal(dto.endsAt);
    if (startsAt === 'NO_SUCH_TIME' || endsAt === 'NO_SUCH_TIME') {
      throw new BadRequestException(
        'That time does not happen: the clocks go from 2 AM straight to 3 AM that night.',
      );
    }
    if (!startsAt || !endsAt)
      throw new BadRequestException('Give the start and end as real dates.');
    if (endsAt <= startsAt) throw new BadRequestException('The cover has to end after it starts.');
    if (endsAt.getTime() - startsAt.getTime() > MAX_COVER_HOURS * 3_600_000) {
      throw new BadRequestException('A cover can last 14 days at most.');
    }
    if (endsAt <= now) throw new BadRequestException('The cover has to end in the future.');
    const note = dto.note?.trim() || null;
    if (note && note.length > 200)
      throw new BadRequestException('Keep the note to 200 characters.');
    const backupEmployeeId = dto.backupEmployeeId || null;
    if (backupEmployeeId && backupEmployeeId === dto.employeeId) {
      throw new BadRequestException('The backup has to be somebody other than the provider.');
    }
    await this.assertProviders(
      backupEmployeeId ? [dto.employeeId, backupEmployeeId] : [dto.employeeId],
    );
    return { startsAt, endsAt, employeeId: dto.employeeId, backupEmployeeId, note };
  }

  private async tellCover(row: CoverRow, actor: AuthUser, what: 'added' | 'changed' | 'removed') {
    const ids = [row.employee.id, row.backup?.id].filter(
      (id): id is string => !!id && id !== actor.id,
    );
    const when = `${coverWords(row.startsAt)} to ${coverWords(row.endsAt)}`;
    await this.notifications.onCall(
      ids,
      {
        title: `On-call cover ${what}`,
        body: `${named(row.employee).name} is on call ${when}${
          row.backup ? `, with ${named(row.backup).name} as backup` : ''
        }. A manager ${what} this cover.`,
      },
      { email: false },
    );
  }
}

function isWorking(status: EmploymentStatus): boolean {
  return (WORKING as EmploymentStatus[]).includes(status);
}

function dialable(person: Dialler): boolean {
  return isWorking(person.employmentStatus) && !person.isSharedAccount && !!numberToRing(person);
}

/// "2026-11-01T01:30" in New Jersey to an instant, or null if not a real day.
/// A time skipped when the clocks go forward is refused rather than moved; a
/// time that happens twice when they go back is the first of the two.
function fromLocal(text: string): Date | null | 'NO_SUCH_TIME' {
  const [date, time] = text.split('T');
  const instant = zonedTimeToUtc(date, time, PRACTICE_ZONE);
  if (localDateIn(instant, PRACTICE_ZONE) !== date) return null;
  return localTimeIn(instant, PRACTICE_ZONE) === time ? instant : 'NO_SUCH_TIME';
}

function coverView(row: CoverRow) {
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    startsLocal: `${localDateIn(row.startsAt, PRACTICE_ZONE)}T${localTimeIn(row.startsAt, PRACTICE_ZONE)}`,
    endsLocal: `${localDateIn(row.endsAt, PRACTICE_ZONE)}T${localTimeIn(row.endsAt, PRACTICE_ZONE)}`,
    employee: named(row.employee),
    backup: row.backup ? named(row.backup) : null,
    note: row.note,
    setBy: row.setBy ? named(row.setBy).name : null,
  };
}

/// "Sat, Oct 24, 6:00 PM" in New Jersey.
function coverWords(at: Date): string {
  return at.toLocaleString('en-US', {
    timeZone: PRACTICE_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function cleanAudioUrl(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  if (text.length > 500) throw new BadRequestException('A recording link can be 500 characters.');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BadRequestException('A recording link has to be a web address.');
  }
  if (url.protocol !== 'https:') {
    throw new BadRequestException('A recording link has to start with https://.');
  }
  return text;
}
