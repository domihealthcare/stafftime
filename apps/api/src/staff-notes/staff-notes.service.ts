import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { A_PERSON } from '../common/people';
import { named, PERSON } from '../on-call/on-call.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffNoteChange, StaffNoteInput } from './dto/staff-notes.dto';
import { aboutThemselves, mayEdit, mayRemove, mayUseNotes, noteProblem } from './staff-notes';

const NOTE_SELECT = {
  id: true,
  employeeId: true,
  authorId: true,
  kind: true,
  body: true,
  createdAt: true,
  editedAt: true,
  employee: { select: { ...PERSON, employmentStatus: true } },
  author: { select: PERSON },
} satisfies Prisma.StaffNoteSelect;

type NoteRow = Prisma.StaffNoteGetPayload<{ select: typeof NOTE_SELECT }>;

/**
 * Confidential notes on staff (2 November 2026, Dominguez; rules in
 * `staff-notes.ts`). Managers and admins, behind the PIN; never the person a
 * note is about, so every read leaves out notes about the reader. Every read
 * is logged, as the staff profiles' are.
 */
@Injectable()
export class StaffNotesService {
  private readonly logger = new Logger(StaffNotesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Every note the reader may see, newest first, and the people a note can
  /// be written about (everybody but the reader and shared accounts).
  async list(reader: AuthUser) {
    this.assertAllowed(reader);
    const [notes, people] = await Promise.all([
      this.prisma.staffNote.findMany({
        where: { employeeId: { not: reader.id } },
        select: NOTE_SELECT,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.employee.findMany({
        where: { ...A_PERSON, id: { not: reader.id } },
        select: { ...PERSON, employmentStatus: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);
    this.logger.log(`Staff notes read by ${reader.id} (${notes.length})`);
    return {
      notes: notes.map((note) => this.present(note, reader)),
      people: people.map((person) => ({
        ...named(person),
        former: person.employmentStatus === 'TERMINATED',
      })),
    };
  }

  async create(dto: StaffNoteInput, reader: AuthUser) {
    this.assertAllowed(reader);
    if (aboutThemselves(reader, dto.employeeId)) {
      throw new ForbiddenException('Notes about you are for others to write.');
    }
    const problem = noteProblem(dto.body);
    if (problem) throw new BadRequestException(problem);
    const person = await this.prisma.employee.findFirst({
      where: { ...A_PERSON, id: dto.employeeId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('That person was not found.');
    const note = await this.prisma.staffNote.create({
      data: {
        employeeId: dto.employeeId,
        authorId: reader.id,
        kind: dto.kind ?? null,
        body: dto.body.trim(),
      },
      select: NOTE_SELECT,
    });
    this.logger.log(`Staff note ${note.id} on ${dto.employeeId} written by ${reader.id}`);
    return this.present(note, reader);
  }

  async update(id: string, dto: StaffNoteChange, reader: AuthUser) {
    this.assertAllowed(reader);
    const note = await this.find(id, reader);
    if (!mayEdit(reader, note)) {
      throw new ForbiddenException('Only the person who wrote a note can change it.');
    }
    const problem = noteProblem(dto.body);
    if (problem) throw new BadRequestException(problem);
    const changed = await this.prisma.staffNote.update({
      where: { id },
      data: { kind: dto.kind ?? null, body: dto.body.trim(), editedAt: new Date() },
      select: NOTE_SELECT,
    });
    this.logger.log(`Staff note ${id} edited by ${reader.id}`);
    return this.present(changed, reader);
  }

  async remove(id: string, reader: AuthUser) {
    this.assertAllowed(reader);
    const note = await this.find(id, reader);
    if (!mayRemove(reader, note)) {
      throw new ForbiddenException('Only the person who wrote a note, or an admin, can remove it.');
    }
    await this.prisma.staffNote.delete({ where: { id } });
    this.logger.log(`Staff note ${id} removed by ${reader.id}`);
    return { removed: true };
  }

  private assertAllowed(reader: AuthUser) {
    if (!mayUseNotes(reader)) {
      throw new ForbiddenException('Staff notes are for managers and admins.');
    }
  }

  /// A note the reader may see: one about themselves is "not found".
  private async find(id: string, reader: AuthUser) {
    const note = await this.prisma.staffNote.findUnique({
      where: { id },
      select: { id: true, employeeId: true, authorId: true },
    });
    if (!note || aboutThemselves(reader, note.employeeId)) {
      throw new NotFoundException('That note was not found.');
    }
    return note;
  }

  private present(note: NoteRow, reader: AuthUser) {
    return {
      id: note.id,
      kind: note.kind,
      body: note.body,
      createdAt: note.createdAt,
      editedAt: note.editedAt,
      person: {
        ...named(note.employee),
        former: note.employee.employmentStatus === 'TERMINATED',
      },
      author: note.author ? named(note.author) : null,
      canEdit: mayEdit(reader, note),
      canRemove: mayRemove(reader, note),
    };
  }
}
