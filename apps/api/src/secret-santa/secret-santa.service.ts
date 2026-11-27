import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EmploymentStatus,
  NotificationKind,
  Prisma,
  Role,
  SecretSantaStatus,
} from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { A_PERSON, assertAPerson } from '../common/people';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { PRACTICE_ZONE, localDateIn } from '../common/util/zoned-time.util';
import { InboxService } from '../email/inbox.service';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NewSecretSantaInput,
  SecretSantaInput,
  SecretSantaPeopleInput,
} from './dto/secret-santa.dto';
import {
  addedBell,
  cancelledBell,
  changedBell,
  closeOver,
  detailsChangedBell,
  drawProblem,
  lateJoinBell,
  spliceIn,
  lookedUpBell,
  drawCircle,
  drawnBell,
  drawnEmail,
  setUpProblem,
  signUpBell,
  signUpOpen,
  type ExchangeWords,
} from './secret-santa';

const HERE: { in: EmploymentStatus[] } = {
  in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE],
};

const PERSON = {
  id: true,
  firstName: true,
  preferredName: true,
  lastName: true,
  photoUpdatedAt: true,
} satisfies Prisma.EmployeeSelect;

type Person = Prisma.EmployeeGetPayload<{ select: typeof PERSON }>;

/// Everything about an exchange but who drew whom. `recipientId` is read
/// only where one member's own is wanted, never in this.
const EXCHANGE = {
  id: true,
  title: true,
  exchangeOn: true,
  budgetDollars: true,
  location: { select: { id: true, name: true } },
  place: true,
  notes: true,
  selfSignUp: true,
  signUpUntil: true,
  status: true,
  drawnAt: true,
  createdAt: true,
  createdBy: { select: PERSON },
  members: {
    select: { employeeId: true, signedUpSelf: true, employee: { select: PERSON } },
    orderBy: { joinedAt: 'asc' },
  },
} satisfies Prisma.SecretSantaSelect;

type Exchange = Prisma.SecretSantaGetPayload<{ select: typeof EXCHANGE }>;

const nameOf = (person: Person) => `${person.preferredName ?? person.firstName} ${person.lastName}`;

const isManager = (user: AuthUser) => user.role === Role.MANAGER || user.role === Role.ADMIN;

const today = () => localDateIn(new Date(), PRACTICE_ZONE);

function dayWords(day: Date): string {
  return day.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function wordsOf(
  exchange: Pick<Exchange, 'id' | 'title' | 'budgetDollars' | 'exchangeOn' | 'location' | 'place'>,
): ExchangeWords {
  const where = [exchange.location?.name, exchange.place].filter(Boolean).join(', ');
  return {
    id: exchange.id,
    title: exchange.title,
    budgetDollars: exchange.budgetDollars,
    when: exchange.exchangeOn ? dayWords(exchange.exchangeOn) : null,
    where: where || null,
  };
}

/**
 * Secret Santa (27 November 2026, Dominguez): a gift exchange where everyone
 * in it draws one colleague at random and secretly buys them a gift within a
 * budget. Managers and admins set it up - the day, the budget, where, who is
 * in it, and whether staff may sign themselves up - and draw the names, which
 * closes it. Each person is then told who they drew, on the screen and by
 * email; the bell (which reaches phones' lock screens) only says the name is
 * ready.
 *
 * **Nobody sees who drew whom**, organizers and admins included: the draw is
 * stored, so each person can look theirs up again, but only ever handed to
 * that person. Taking somebody out after the draw gives their Santa the
 * person they had drawn, and only that Santa is told, so even then the
 * organizer learns nothing.
 */
@Injectable()
export class SecretSantaService {
  private readonly logger = new Logger(SecretSantaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------- reading

  /// Managers see every one; staff the ones they are in, and the ones open
  /// for them to sign up to. Newest exchange first.
  async list(user: AuthUser) {
    const exchanges = await this.prisma.secretSanta.findMany({
      where: isManager(user)
        ? {}
        : {
            OR: [
              { members: { some: { employeeId: user.id } } },
              { status: SecretSantaStatus.OPEN, selfSignUp: true },
            ],
          },
      select: EXCHANGE,
      orderBy: [{ exchangeOn: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    return Promise.all(exchanges.map((exchange) => this.shape(exchange, user)));
  }

  async findOne(id: string, user: AuthUser) {
    const exchange = await this.require(id);
    const inIt = exchange.members.some((member) => member.employeeId === user.id);
    const open = exchange.status === SecretSantaStatus.OPEN && exchange.selfSignUp;
    if (!inIt && !open && !isManager(user)) {
      throw new NotFoundException('That Secret Santa is not there.');
    }
    return this.shape(exchange, user);
  }

  // ------------------------------------------------------------ managers

  async create(dto: NewSecretSantaInput, actor: AuthUser) {
    const fields = await this.check(dto);
    const people = dto.people ? await this.peopleFor(dto.people) : [];
    const created = await this.prisma.secretSanta.create({
      data: {
        ...fields,
        createdById: actor.id,
        members: { create: people.map((employeeId) => ({ employeeId })) },
      },
      select: EXCHANGE,
    });
    this.logger.log(
      `Secret Santa ${created.id} set up by ${actor.id} with ${people.length} people`,
    );

    const words = wordsOf(created);
    await this.inbox.notify(people, { kind: NotificationKind.SECRET_SANTA, ...addedBell(words) });
    if (created.selfSignUp) {
      const others = await this.prisma.employee.findMany({
        where: { employmentStatus: HERE, ...A_PERSON, id: { notIn: people } },
        select: { id: true },
      });
      await this.inbox.notify(
        others.map((person) => person.id),
        {
          kind: NotificationKind.SECRET_SANTA,
          ...signUpBell(words, created.signUpUntil ? dayWords(created.signUpUntil) : null),
        },
      );
    }
    return this.shape(created, actor);
  }

  /// A change to the details. Once drawn, the people in it hear when the
  /// day, the budget or the place moves.
  async update(id: string, dto: SecretSantaInput, actor: AuthUser) {
    const before = await this.require(id);
    if (before.status === SecretSantaStatus.DRAWN && !dto.exchangeOn) {
      throw new BadRequestException('The names are drawn, so the day of the exchange stays set.');
    }
    const fields = await this.check(dto, before.exchangeOn);
    const opensSignUp =
      before.status === SecretSantaStatus.OPEN && !before.selfSignUp && fields.selfSignUp;
    const updated = await this.prisma.secretSanta.update({
      where: { id },
      data: fields,
      select: EXCHANGE,
    });
    this.logger.log(`Secret Santa ${id} changed by ${actor.id}`);

    const was = wordsOf(before);
    const now = wordsOf(updated);
    const moved =
      was.when !== now.when || was.where !== now.where || was.budgetDollars !== now.budgetDollars;
    if (moved && updated.members.length > 0) {
      await this.inbox.notify(
        updated.members.map((member) => member.employeeId),
        { kind: NotificationKind.SECRET_SANTA, ...detailsChangedBell(now) },
      );
    }
    if (opensSignUp) {
      const others = await this.prisma.employee.findMany({
        where: {
          employmentStatus: HERE,
          ...A_PERSON,
          id: { notIn: updated.members.map((member) => member.employeeId) },
        },
        select: { id: true },
      });
      await this.inbox.notify(
        others.map((person) => person.id),
        {
          kind: NotificationKind.SECRET_SANTA,
          ...signUpBell(now, updated.signUpUntil ? dayWords(updated.signUpUntil) : null),
        },
      );
    }
    return this.shape(updated, actor);
  }

  /// Cancelled: gone, and everybody in it told.
  async remove(id: string, actor: AuthUser) {
    const exchange = await this.require(id);
    await this.prisma.secretSanta.delete({ where: { id } });
    this.logger.log(`Secret Santa ${id} cancelled by ${actor.id}`);
    const inIt = exchange.members
      .map((member) => member.employeeId)
      .filter((employeeId) => employeeId !== actor.id);
    await this.inbox.notify(inIt, {
      kind: NotificationKind.SECRET_SANTA,
      ...cancelledBell(wordsOf(exchange)),
    });
    return { removed: true };
  }

  /// Adds people before the draw. Anybody already in it is left as they are.
  async addPeople(id: string, dto: SecretSantaPeopleInput, actor: AuthUser) {
    const exchange = await this.require(id);
    const already = new Set(exchange.members.map((member) => member.employeeId));
    const people = (await this.peopleFor(dto)).filter((employeeId) => !already.has(employeeId));
    if (exchange.status === SecretSantaStatus.DRAWN) {
      return this.addAfterDraw(exchange, people, actor);
    }
    if (people.length > 0) {
      await this.prisma.secretSantaMember.createMany({
        data: people.map((employeeId) => ({ exchangeId: id, employeeId })),
        skipDuplicates: true,
      });
      await this.inbox.notify(people, {
        kind: NotificationKind.SECRET_SANTA,
        ...addedBell(wordsOf(exchange)),
      });
    }
    this.logger.log(`Secret Santa ${id}: ${people.length} added by ${actor.id}`);
    return { added: people.length, exchange: await this.shape(await this.require(id), actor) };
  }

  /// Somebody added after the names are drawn (27 November 2026, Dominguez):
  /// each goes into the circle after a random person, who is now buying for
  /// them and is told; they are told who they drew. Nobody else changes.
  private async addAfterDraw(exchange: Exchange, people: string[], actor: AuthUser) {
    const day = this.state(exchange).exchangeOn;
    if (day && day < today()) {
      throw new ConflictException('The exchange has happened, so nobody can be added now.');
    }
    const changedSantas = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      for (const joining of people) {
        const rows = await tx.secretSantaMember.findMany({
          where: { exchangeId: exchange.id },
          select: { employeeId: true, recipientId: true },
        });
        const pairs = new Map(
          rows.flatMap((row) =>
            row.recipientId ? [[row.employeeId, row.recipientId] as const] : [],
          ),
        );
        const { santa, joinerGives } = spliceIn(pairs, joining);
        // The Santa takes the newcomer first, so their old person is free.
        await tx.secretSantaMember.update({
          where: { exchangeId_employeeId: { exchangeId: exchange.id, employeeId: santa } },
          data: { recipientId: joining },
        });
        await tx.secretSantaMember.create({
          data: { exchangeId: exchange.id, employeeId: joining, recipientId: joinerGives },
        });
        changedSantas.add(santa);
      }
    });
    this.logger.log(
      `Secret Santa ${exchange.id}: ${people.length} added after the draw by ${actor.id}`,
    );
    // A Santa who was then given to somebody added later is told once, of
    // whoever they have at the end; a newcomer who became a Santa too is
    // told only as a newcomer.
    for (const joining of people) await this.tellWhoTheyDrew(exchange.id, joining, 'joined');
    for (const santa of changedSantas) {
      if (!people.includes(santa)) await this.tellWhoTheyDrew(exchange.id, santa, 'changed');
    }
    return {
      added: people.length,
      exchange: await this.shape(await this.require(exchange.id), actor),
    };
  }

  /// Takes somebody out. After the draw, whoever drew them is given the
  /// person they had drawn, and told; nobody else is.
  async removePerson(id: string, employeeId: string, actor: AuthUser) {
    const exchange = await this.require(id);
    if (!exchange.members.some((member) => member.employeeId === employeeId)) {
      throw new NotFoundException('They are not in this Secret Santa.');
    }
    if (exchange.status === SecretSantaStatus.OPEN) {
      await this.prisma.secretSantaMember.delete({
        where: { exchangeId_employeeId: { exchangeId: id, employeeId } },
      });
      this.logger.log(`Secret Santa ${id}: a member taken out by ${actor.id}`);
      return this.shape(await this.require(id), actor);
    }

    const santa = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.secretSantaMember.findMany({
        where: { exchangeId: id },
        select: { employeeId: true, recipientId: true },
      });
      const pairs = new Map(
        rows.flatMap((row) =>
          row.recipientId ? [[row.employeeId, row.recipientId] as const] : [],
        ),
      );
      const closed = closeOver(pairs, employeeId);
      if (closed && !closed.ok) throw new BadRequestException(closed.reason);
      await tx.secretSantaMember.delete({
        where: { exchangeId_employeeId: { exchangeId: id, employeeId } },
      });
      if (!closed) return null;
      await tx.secretSantaMember.update({
        where: { exchangeId_employeeId: { exchangeId: id, employeeId: closed.santa } },
        data: { recipientId: closed.newRecipient },
      });
      return closed;
    });
    this.logger.log(`Secret Santa ${id}: a member taken out after the draw by ${actor.id}`);
    if (santa) await this.tellWhoTheyDrew(id, santa.santa, 'changed');
    return this.shape(await this.require(id), actor);
  }

  /// Closes it and draws the names: one circle through everybody still here,
  /// each told who they drew on the screen and by email.
  async draw(id: string, actor: AuthUser) {
    const exchange = await this.require(id);
    if (exchange.status !== SecretSantaStatus.OPEN) {
      throw new ConflictException('The names are already drawn.');
    }
    const here = await this.prisma.employee.findMany({
      where: {
        id: { in: exchange.members.map((member) => member.employeeId) },
        employmentStatus: HERE,
        ...A_PERSON,
      },
      select: { id: true },
    });
    const ids = here.map((person) => person.id);
    const problem = drawProblem(this.state(exchange).exchangeOn, ids.length);
    if (problem) throw new BadRequestException(problem);
    const pairs = drawCircle(ids);

    await this.prisma.$transaction(async (tx) => {
      // Claimed first, so two presses at once cannot draw twice.
      const claimed = await tx.secretSanta.updateMany({
        where: { id, status: SecretSantaStatus.OPEN },
        data: { status: SecretSantaStatus.DRAWN, drawnAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException('The names are already drawn.');
      // Anybody who has left since they were added is not in the draw.
      await tx.secretSantaMember.deleteMany({
        where: { exchangeId: id, employeeId: { notIn: ids } },
      });
      for (const [giver, recipient] of pairs) {
        await tx.secretSantaMember.update({
          where: { exchangeId_employeeId: { exchangeId: id, employeeId: giver } },
          data: { recipientId: recipient },
        });
      }
    });
    this.logger.log(`Secret Santa ${id}: names drawn by ${actor.id} for ${ids.length} people`);

    for (let start = 0; start < ids.length; start += 5) {
      await Promise.all(
        ids.slice(start, start + 5).map((giver) => this.tellWhoTheyDrew(id, giver)),
      );
    }
    return this.shape(await this.require(id), actor);
  }

  // ---------------------------------------------------------- the person

  async join(id: string, user: AuthUser) {
    await assertAPerson(
      this.prisma,
      user.id,
      'A shared account does not take part in Secret Santa. Sign in as yourself.',
    );
    const exchange = await this.require(id);
    if (!signUpOpen(this.state(exchange), today())) {
      throw new ConflictException(
        exchange.status === SecretSantaStatus.DRAWN
          ? 'The names are already drawn.'
          : 'Sign-ups for this Secret Santa are closed. Ask whoever set it up to add you.',
      );
    }
    await this.prisma.secretSantaMember.upsert({
      where: { exchangeId_employeeId: { exchangeId: id, employeeId: user.id } },
      create: { exchangeId: id, employeeId: user.id, signedUpSelf: true },
      update: {},
    });
    this.logger.log(`Secret Santa ${id}: ${user.id} signed up`);
    return this.shape(await this.require(id), user);
  }

  /// Taking yourself out before the draw. Afterwards it is an organizer's
  /// to do, as somebody is buying for you.
  async leave(id: string, user: AuthUser) {
    const exchange = await this.require(id);
    if (exchange.status !== SecretSantaStatus.OPEN) {
      throw new ConflictException(
        'The names are already drawn. Ask whoever set it up to take you out, so whoever drew you is given somebody else.',
      );
    }
    await this.prisma.secretSantaMember.deleteMany({
      where: { exchangeId: id, employeeId: user.id },
    });
    this.logger.log(`Secret Santa ${id}: ${user.id} left`);
    return this.shape(await this.require(id), user);
  }

  /// Gift ideas for whoever draws you; they see them as soon as they are
  /// saved, before or after the draw.
  async setWishes(id: string, wishes: string, user: AuthUser) {
    const exchange = await this.require(id);
    if (!exchange.members.some((member) => member.employeeId === user.id)) {
      throw new NotFoundException('You are not in this Secret Santa.');
    }
    await this.prisma.secretSantaMember.update({
      where: { exchangeId_employeeId: { exchangeId: id, employeeId: user.id } },
      data: { wishes: wishes.trim() || null },
    });
    return this.shape(exchange, user);
  }

  /// Emails you who you drew again.
  async emailMe(id: string, user: AuthUser) {
    const exchange = await this.require(id);
    const mine = await this.prisma.secretSantaMember.findUnique({
      where: { exchangeId_employeeId: { exchangeId: id, employeeId: user.id } },
      select: { recipientId: true },
    });
    if (exchange.status !== SecretSantaStatus.DRAWN || !mine?.recipientId) {
      throw new BadRequestException('The names are not drawn yet.');
    }
    await this.tellWhoTheyDrew(id, user.id, 'again');
    return { sent: true };
  }

  /// Who you drew, with their gift ideas as they are now. The route is
  /// behind the PIN (November 2026, Dominguez: "to be able to show your
  /// secret santa it should require a pin in the app for all users").
  async mine(id: string, user: AuthUser) {
    const exchange = await this.require(id);
    const mine = await this.prisma.secretSantaMember.findUnique({
      where: { exchangeId_employeeId: { exchangeId: id, employeeId: user.id } },
      select: { recipientId: true },
    });
    if (exchange.status !== SecretSantaStatus.DRAWN || !mine?.recipientId) {
      throw new NotFoundException('You have nobody to buy for in this Secret Santa.');
    }
    const drew = await this.prisma.secretSantaMember.findUnique({
      where: { exchangeId_employeeId: { exchangeId: id, employeeId: mine.recipientId } },
      select: { wishes: true, employee: { select: PERSON } },
    });
    if (!drew) throw new NotFoundException('You have nobody to buy for in this Secret Santa.');
    return { ...drew.employee, name: nameOf(drew.employee), wishes: drew.wishes };
  }

  /// An organizer, in an emergency, finding out who ONE person drew (27
  /// November 2026, Dominguez: "during the exchange the person forgot who
  /// they had ... limited to the question and not just a full list"). From
  /// the day of the exchange on, never for themselves, behind their PIN;
  /// every look-up is kept for the other organizers to see, and the person
  /// is told on the bell. There is no route that answers for more than one.
  async lookUp(id: string, employeeId: string, actor: AuthUser) {
    const exchange = await this.require(id);
    if (exchange.status !== SecretSantaStatus.DRAWN) {
      throw new BadRequestException('The names are not drawn yet.');
    }
    const day = this.state(exchange).exchangeOn;
    if (!day || !exchange.exchangeOn || day > today()) {
      throw new BadRequestException(
        `Looking somebody up is for the day of the exchange${exchange.exchangeOn ? `, ${dayWords(exchange.exchangeOn)},` : ''} in an emergency. Until then they can see who they drew in Domi Staff, or press Email it to me again.`,
      );
    }
    if (employeeId === actor.id) {
      throw new BadRequestException('Look yours up on this page, behind your own PIN.');
    }
    const member = await this.prisma.secretSantaMember.findUnique({
      where: { exchangeId_employeeId: { exchangeId: id, employeeId } },
      select: { recipientId: true, employee: { select: PERSON } },
    });
    if (!member) throw new NotFoundException('They are not in this Secret Santa.');
    if (!member.recipientId) throw new NotFoundException('They have nobody to buy for.');
    const drew = await this.prisma.employee.findUniqueOrThrow({
      where: { id: member.recipientId },
      select: PERSON,
    });
    await this.prisma.secretSantaLookup.create({
      data: { exchangeId: id, lookedUpById: actor.id, employeeId },
    });
    this.logger.log(`Secret Santa ${id}: ${actor.id} looked up who ${employeeId} drew`);

    const organizer = await this.prisma.employee.findUnique({
      where: { id: actor.id },
      select: PERSON,
    });
    await this.inbox.notify([employeeId], {
      kind: NotificationKind.SECRET_SANTA,
      ...lookedUpBell(wordsOf(exchange), organizer ? nameOf(organizer) : 'An organizer'),
    });
    return {
      who: nameOf(member.employee),
      drew: { ...drew, name: nameOf(drew) },
      lookups: await this.lookupsOf(id),
    };
  }

  // ------------------------------------------------------------- helpers

  /// The bell (no name) and the email (the name and their gift ideas).
  private async tellWhoTheyDrew(
    id: string,
    giverId: string,
    why: 'drawn' | 'changed' | 'joined' | 'again' = 'drawn',
  ) {
    const row = await this.prisma.secretSantaMember.findUnique({
      where: { exchangeId_employeeId: { exchangeId: id, employeeId: giverId } },
      select: {
        recipientId: true,
        exchange: {
          select: {
            id: true,
            title: true,
            budgetDollars: true,
            exchangeOn: true,
            place: true,
            location: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row?.recipientId) return;
    const recipient = await this.prisma.secretSantaMember.findUnique({
      where: { exchangeId_employeeId: { exchangeId: id, employeeId: row.recipientId } },
      select: { wishes: true, employee: { select: PERSON } },
    });
    if (!recipient) return;
    const words = wordsOf(row.exchange);
    const email = drawnEmail(
      words,
      { name: nameOf(recipient.employee), wishes: recipient.wishes },
      why === 'changed',
    );
    if (why !== 'again') {
      await this.notifications.privately(
        giverId,
        NotificationKind.SECRET_SANTA,
        why === 'changed'
          ? changedBell(words)
          : why === 'joined'
            ? lateJoinBell(words)
            : drawnBell(words),
        email,
      );
    } else {
      await this.notifications.emailOnly(giverId, email, drawnBell(words).link);
    }
  }

  /// What the screen shows this person: the details, who is in it, and their
  /// own part - never anybody else's draw.
  private async shape(exchange: Exchange, user: AuthUser) {
    const mine = await this.prisma.secretSantaMember.findUnique({
      where: { exchangeId_employeeId: { exchangeId: exchange.id, employeeId: user.id } },
      select: { wishes: true, recipientId: true },
    });
    const state = this.state(exchange);
    const open = signUpOpen(state, today());
    // A shared account is not a person, so it never joins one.
    const shared =
      mine === null &&
      open &&
      (await this.prisma.employee.count({ where: { id: user.id, isSharedAccount: true } })) > 0;
    return {
      id: exchange.id,
      title: exchange.title,
      exchangeOn: state.exchangeOn,
      budgetDollars: exchange.budgetDollars,
      location: exchange.location,
      place: exchange.place,
      notes: exchange.notes,
      selfSignUp: exchange.selfSignUp,
      signUpUntil: state.signUpUntil,
      signUpOpen: open,
      status: exchange.status,
      drawnAt: exchange.drawnAt,
      createdAt: exchange.createdAt,
      createdBy: exchange.createdBy ? nameOf(exchange.createdBy) : null,
      canManage: isManager(user),
      members: exchange.members.map((member) => ({
        ...member.employee,
        name: nameOf(member.employee),
        signedUpSelf: member.signedUpSelf,
      })),
      me: {
        inIt: mine !== null,
        wishes: mine?.wishes ?? null,
        canJoin: mine === null && open && !shared,
        canLeave: mine !== null && exchange.status === SecretSantaStatus.OPEN,
        /// Whether they have somebody to buy for. Who it is comes from
        /// `mine()`, behind their PIN.
        drawn: Boolean(mine?.recipientId) && exchange.status === SecretSantaStatus.DRAWN,
      },
      lookups: isManager(user) ? await this.lookupsOf(exchange.id) : [],
      canLookUp:
        isManager(user) &&
        exchange.status === SecretSantaStatus.DRAWN &&
        state.exchangeOn !== null &&
        state.exchangeOn <= today(),
    };
  }

  /// Who looked up whose draw, and when: never the answer.
  private async lookupsOf(exchangeId: string) {
    const rows = await this.prisma.secretSantaLookup.findMany({
      where: { exchangeId },
      select: {
        id: true,
        createdAt: true,
        lookedUpBy: { select: PERSON },
        employee: { select: PERSON },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      at: row.createdAt,
      by: row.lookedUpBy ? nameOf(row.lookedUpBy) : null,
      whose: nameOf(row.employee),
    }));
  }

  private state(exchange: Pick<Exchange, 'status' | 'selfSignUp' | 'signUpUntil' | 'exchangeOn'>) {
    return {
      status: exchange.status,
      selfSignUp: exchange.selfSignUp,
      signUpUntil: exchange.signUpUntil ? isoDate(exchange.signUpUntil) : null,
      exchangeOn: exchange.exchangeOn ? isoDate(exchange.exchangeOn) : null,
    };
  }

  private async require(id: string): Promise<Exchange> {
    const exchange = await this.prisma.secretSanta.findUnique({ where: { id }, select: EXCHANGE });
    if (!exchange) throw new NotFoundException('That Secret Santa is not there.');
    return exchange;
  }

  /// The checked fields to save. A change keeps an exchange day already
  /// past (it can still be edited after the party), but a new one cannot be.
  private async check(dto: SecretSantaInput, savedDay?: Date | null) {
    const day = today();
    const problem = setUpProblem(
      {
        title: dto.title,
        exchangeOn: dto.exchangeOn,
        budgetDollars: dto.budgetDollars,
        signUpUntil: dto.signUpUntil,
      },
      savedDay && dto.exchangeOn && isoDate(savedDay) === dto.exchangeOn ? dto.exchangeOn : day,
    );
    if (problem) throw new BadRequestException(problem);
    if (dto.locationId) {
      const found = await this.prisma.location.count({ where: { id: dto.locationId } });
      if (!found) throw new BadRequestException('That office is no longer in the app.');
    }
    return {
      title: dto.title.trim(),
      exchangeOn: dto.exchangeOn ? toUtcDate(dto.exchangeOn) : null,
      budgetDollars: dto.budgetDollars,
      locationId: dto.locationId || null,
      place: dto.place?.trim() || null,
      notes: dto.notes?.trim() || null,
      selfSignUp: dto.selfSignUp,
      signUpUntil: dto.selfSignUp && dto.signUpUntil ? toUtcDate(dto.signUpUntil) : null,
    };
  }

  /// Everybody, or the offices, job roles and people chosen, as ids of people
  /// still here (never a shared account).
  private async peopleFor(dto: SecretSantaPeopleInput): Promise<string[]> {
    const any: Prisma.EmployeeWhereInput[] = [];
    if (dto.employeeIds?.length) any.push({ id: { in: dto.employeeIds } });
    if (dto.jobRoleIds?.length)
      any.push({ jobRoles: { some: { jobRoleId: { in: dto.jobRoleIds } } } });
    if (dto.locationIds?.length) {
      any.push({ locations: { some: { locationId: { in: dto.locationIds } } } });
    }
    if (!dto.everyone && any.length === 0) return [];
    const people = await this.prisma.employee.findMany({
      where: { employmentStatus: HERE, ...A_PERSON, ...(dto.everyone ? {} : { OR: any }) },
      select: { id: true },
    });
    return people.map((person) => person.id);
  }
}
