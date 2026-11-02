import { StaffNoteKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MAX_NOTE_LENGTH } from '../staff-notes';

/// A new note: who it is about, what kind (optional) and the words.
export class StaffNoteInput {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsEnum(StaffNoteKind)
  kind?: StaffNoteKind | null;

  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  body!: string;
}

/// A change to a note: its kind and words; who it is about stays.
export class StaffNoteChange {
  @IsOptional()
  @IsEnum(StaffNoteKind)
  kind?: StaffNoteKind | null;

  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  body!: string;
}
