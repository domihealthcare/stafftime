import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PracticeEventKind } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { A_PERSON } from '../common/people';
import { PROVIDER } from '../on-call/on-call.service';
import { PrismaService } from '../prisma/prisma.service';
import { StudentInput } from './dto/student.dto';
import { providerName } from './students';

/**
 * Students and residents who rotate with the practice's providers (3 November
 * 2026, Dominguez). Names only: they have no account and never clock in, and
 * nothing is kept to reach them by. Managers and admins keep the list; the
 * dates themselves are practice calendar entries of kind ROTATION, which
 * everybody sees (`events.service.ts`).
 */
@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Everybody on the list, by name, with their first and last rotation date.
  async list() {
    const students = await this.prisma.student.findMany({ orderBy: { name: 'asc' } });
    const dates = await this.prisma.practiceEvent.groupBy({
      by: ['studentId'],
      where: { kind: PracticeEventKind.ROTATION, studentId: { not: null } },
      _min: { startsAt: true },
      _max: { startsAt: true },
    });
    const byStudent = new Map(dates.map((row) => [row.studentId, row]));
    return students.map((student) => ({
      ...student,
      firstDate: byStudent.get(student.id)?._min.startsAt ?? null,
      lastDate: byStudent.get(student.id)?._max.startsAt ?? null,
    }));
  }

  /// The providers a student can rotate with: anybody still here in a job
  /// role that carries the clinical forms, as for on call.
  async providers() {
    const people = await this.prisma.employee.findMany({
      where: { AND: [PROVIDER, A_PERSON] },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        postNominals: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return people.map((person) => ({ id: person.id, name: providerName(person) }));
  }

  async create(dto: StudentInput, actor: AuthUser) {
    const student = await this.prisma.student.create({ data: clean(dto) });
    this.logger.log(`Student ${student.id} added by ${actor.id}`);
    return student;
  }

  async update(id: string, dto: StudentInput, actor: AuthUser) {
    await this.require(id);
    const data = clean(dto);
    const [student] = await this.prisma.$transaction([
      this.prisma.student.update({ where: { id }, data }),
      // Their rotation dates are named after them, so a corrected name follows.
      this.prisma.practiceEvent.updateMany({
        where: { studentId: id, kind: PracticeEventKind.ROTATION },
        data: { title: data.name },
      }),
    ]);
    this.logger.log(`Student ${id} changed by ${actor.id}`);
    return student;
  }

  /// Off the list. Their rotation dates stay on the calendar, still named.
  async remove(id: string, actor: AuthUser) {
    await this.require(id);
    await this.prisma.student.delete({ where: { id } });
    this.logger.log(`Student ${id} removed by ${actor.id}`);
    return { removed: true };
  }

  private async require(id: string) {
    const found = await this.prisma.student.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('That student is no longer on the list.');
  }
}

/// Trimmed, with a blank school stored as nothing.
function clean(dto: StudentInput) {
  return {
    name: dto.name.trim(),
    kind: dto.kind,
    school: dto.school?.trim() || null,
  };
}
